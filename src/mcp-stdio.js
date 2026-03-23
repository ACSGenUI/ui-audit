#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import LockManager from './lock-manager.js';
import CsvManager from './csv-manager.js';
import MetricsProcessor from './metrics-processor.js';
import AuditLogger from './audit-logger.js';
import LocalAuditTool from './local-audit-tool.js';
import { validatePayload } from './validator.js';
import { readFile, copyFile, access, mkdir } from 'fs/promises';
import { resolve } from 'path';
import config from './config.js';

const { version } = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf-8')
);

// ── Bootstrap: copy templates from artifacts → workspace on startup ──

async function bootstrap() {
  await mkdir(config.workspaceDir, { recursive: true });
  for (const [, filename] of Object.entries(config.templates)) {
    const src = resolve(config.artifactsDir, filename);
    const dest = resolve(config.workspaceDir, filename);
    try {
      await access(dest);
      // Workspace copy already exists — leave it (may have in-progress audit data)
    } catch {
      // No workspace copy yet — seed from artifacts
      await copyFile(src, dest);
    }
  }
}

await bootstrap();

const lockManager = new LockManager();
const csvManager = new CsvManager(lockManager);
const metricsProcessor = new MetricsProcessor(lockManager);
const auditLogger = new AuditLogger();
const localAuditTool = new LocalAuditTool();

const server = new McpServer({
  name: 'ui-audit',
  version,
});

// ── Resources (served from workspace copies — artifacts are read-only masters) ──

async function ensureWorkspaceCopy(templateName) {
  const filename = config.templates[templateName];
  const src = resolve(config.artifactsDir, filename);
  const dest = resolve(config.workspaceDir, filename);
  try {
    await access(dest);
  } catch {
    await copyFile(src, dest);
  }
  return dest;
}

server.resource(`checklist-template-v${version}`, `audit://templates/checklist?v=${version}`, async (uri) => {
  const filePath = await ensureWorkspaceCopy('checklist');
  const content = await readFile(filePath, 'utf-8');
  return { contents: [{ uri: uri.href, mimeType: 'text/csv', text: content }] };
});

server.resource(`metrics-template-v${version}`, `audit://templates/metrics?v=${version}`, async (uri) => {
  const filePath = await ensureWorkspaceCopy('metrics');
  const content = await readFile(filePath, 'utf-8');
  return { contents: [{ uri: uri.href, mimeType: 'text/csv', text: content }] };
});

// ── Prompts ──

server.prompt(
  'start-audit',
  '16-Mar-2026/v4: Start a UI audit for the workspace codebase. Provide the running app URL.',
  {
    appUrl: z.string().describe('URL of the running application (e.g. http://localhost:3000)'),
    focusArea: z.string().optional().describe('Optional: focus on a specific area like "accessibility", "performance", "security", "forms", "semantics". Leave empty to audit everything.'),
  },
  ({ appUrl, focusArea }) => {
    const ws = config.workspaceDir;
    const focusLine = focusArea
      ? `\n## Focus Area\nOnly audit rows related to **${focusArea}**. Skip rows outside this area by marking them "NA" with comment "Out of scope for focused audit".`
      : '';

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `You are a UI audit agent. You have access to the ui-audit MCP server tools.

## Target
- **Codebase path (workspace):** ${ws}
- **Running app URL:** ${appUrl}
${focusLine}

## Workflow

1. **Download templates to workspace first:**
   - Call \`download-template\` with \`name: "checklist"\` to copy the checklist into the workspace.
   - Call \`download-template\` with \`name: "metrics"\` to copy the metrics template into the workspace.
   - Confirm both downloads succeeded before proceeding.
2. Call \`get-checklist-status\` to see current progress.
3. Audit one row at a time using this loop:

### For each row:
   a. Call \`read-checklist-row\` with \`mode: "next_unchecked"\` to get one row.
   b. Read the **Checklist Item**, **Audit Type**, and **Importance** fields.
   c. Based on **Audit Type**, choose your method:

      **"Code Audit"** → Use \`run-local-audit\`. Commands run inside the workspace \`${ws}\` by default.
        Examples:
        - \`grep -rn "tabindex" src/\`
        - \`grep -rn "<h1" src/ | wc -l\`
        - \`npx eslint src/ --format json\`
        - \`cat package.json\`

      **"Visual Audit"** or **"Browser Audit"** → Use **Chrome DevTools MCP** tools (available in your editor environment) to inspect \`${appUrl}\`.
        Examples:
        - Navigate to \`${appUrl}\`
        - Query DOM elements (e.g., \`[role='button']\`, \`img[alt]\`)
        - Take screenshots for evidence
        - Evaluate JavaScript expressions
        - Inspect network requests and computed styles
        After performing the browser audit, call \`chromedevtools-audit\` with a description to log the action.

      **"Both"** → Run both local and browser checks.

   d. Call \`write-checklist-row\` with:
      - \`implemented\`: "Yes", "No", or "NA"
      - \`comments\`: Concise explanation of findings
      - \`evidence\`: URL, screenshot artifact path, or source file path
   e. **After writing, discard all row content from your context.** Do not carry forward any row data.
   f. If your audit takes a while, call \`extend-lock\` before the 10-minute expiry.
   g. If the browser tool fails, mark as "NA" with the failure reason, and move on.

4. After every 10 rows, call \`get-checklist-status\` and report progress to the user.
5. Do NOT retry failed commands more than 3 times. Mark the row "NA" and continue.

## Rules
- Process **ONE row at a time**. Never batch.
- Keep responses short — structured JSON-style findings.
- Do not accumulate past row data in your context.
- Only write to the three allowed columns: Implemented?, Comments, Evidence.

Begin now. Check the checklist status, then start auditing from the first unchecked row.`,
          },
        },
      ],
    };
  }
);

server.prompt(
  'audit-status',
  'Check the current audit progress and get a summary.',
  {},
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Call \`get-checklist-status\` and \`get-metrics-status\` and \`get-observability-metrics\`, then give me a concise summary of:
- How many checklist rows are done vs pending vs locked
- How many metrics rows are filled vs empty
- Error rate and average audit time
- Any issues or blockers`,
        },
      },
    ],
  })
);

server.prompt(
  'resume-audit',
  'Resume an interrupted audit from where it left off.',
  {
    appUrl: z.string().describe('URL of the running application (e.g. http://localhost:3000)'),
  },
  ({ appUrl }) => {
    const ws = config.workspaceDir;
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `You are a UI audit agent resuming an interrupted audit.

## Target
- **Codebase path (workspace):** ${ws}
- **Running app URL:** ${appUrl}

## Steps
1. **Ensure templates are in workspace:**
   - Call \`download-template\` with \`name: "checklist"\` to ensure the checklist exists in the workspace.
   - Call \`download-template\` with \`name: "metrics"\` to ensure the metrics template exists in the workspace.
2. Call \`get-checklist-status\` to see how many rows are done/pending/locked.
3. Report the current progress to me.
4. Call \`read-checklist-row\` with \`mode: "next_unchecked"\` to pick up from the next unprocessed row.
5. Continue the same single-row audit workflow:
   - Read one row → audit via \`run-local-audit\` or **Chrome DevTools MCP** tools → write results → discard row → next.
6. Report progress every 10 rows.

## Rules
- ONE row at a time. No batching.
- Discard row content from context after each write.
- If a row is locked by a previous session, skip it — it will auto-expire.

Begin by checking status and reporting progress.`,
          },
        },
      ],
    };
  }
);

// ── Tools ──

server.tool(
  'download-template',
  'Download a fresh template from artifacts into the workspace (overwrites any existing workspace copy) and return path, columns, row count. Use this to reset a template to its clean state.',
  { name: z.enum(['checklist', 'metrics']) },
  async ({ name }) => {
    const filename = config.templates[name];
    const src = resolve(config.artifactsDir, filename);
    const dest = resolve(config.workspaceDir, filename);
    await copyFile(src, dest);
    const result = await csvManager.download(name, 'mcp-client');
    auditLogger.log({ action: 'download', clientId: 'mcp-client', template: name, outcome: result.ok ? 'success' : 'error', details: result });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

server.tool(
  'read-checklist-row',
  'Read exactly one checklist row. Use mode "next_unchecked" to get the next unprocessed row, or "by_row_id" with a rowId for a specific row. Returns fields, rowId, lockId, and lock expiry.',
  {
    mode: z.enum(['next_unchecked', 'by_row_id']),
    rowId: z.number().optional(),
  },
  async ({ mode, rowId }) => {
    const result = await csvManager.readRow('checklist', { mode, rowId, clientId: 'mcp-client' });
    auditLogger.log({ action: 'read_row', clientId: 'mcp-client', template: 'checklist', rowId: result.rowId ?? rowId, lockId: result.lockId, outcome: result.ok ? 'success' : 'error' });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

server.tool(
  'write-checklist-row',
  'Write audit results for one checklist row. Only three columns allowed: "Implemented? (Yes / No / NA)", "Comments", "Evidence". Requires rowId and lockId from a prior read. After a successful write, DISCARD the row content from your context.',
  {
    rowId: z.number(),
    lockId: z.string(),
    implemented: z.enum(['Yes', 'No', 'NA', 'yes', 'no', 'na', 'N/A', 'n/a']),
    comments: z.string().max(2000),
    evidence: z.string(),
    keepLock: z.boolean().optional(),
  },
  async ({ rowId, lockId, implemented, comments, evidence, keepLock }) => {
    const payload = {
      'Implemented? (Yes / No / NA)': implemented,
      'Comments': comments,
      'Evidence': evidence,
    };
    const validation = validatePayload(payload);
    if (!validation.valid) {
      auditLogger.log({ action: 'write_row', clientId: 'mcp-client', template: 'checklist', rowId, lockId, outcome: 'error', details: validation.errors });
      return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'VALIDATION_FAILED', errors: validation.errors }) }] };
    }
    const result = await csvManager.writeRow('checklist', { rowId, lockId, payload: validation.payload, keepLock });
    auditLogger.log({ action: 'write_row', clientId: 'mcp-client', template: 'checklist', rowId, lockId, outcome: result.ok ? 'success' : 'error' });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

server.tool(
  'read-metrics-row',
  'Read one metrics row. Use mode "next_empty" for next unfilled row, or "by_row_id" with a rowId.',
  {
    mode: z.enum(['next_empty', 'by_row_id']),
    rowId: z.number().optional(),
  },
  async ({ mode, rowId }) => {
    const result = await metricsProcessor.readRow({ mode, rowId, clientId: 'mcp-client' });
    auditLogger.log({ action: 'read_row', clientId: 'mcp-client', template: 'metrics', rowId: result.rowId ?? rowId, lockId: result.lockId, outcome: result.ok ? 'success' : 'error' });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

server.tool(
  'write-metrics-row',
  'Write a value to one metrics row. Requires rowId and lockId from a prior read.',
  {
    rowId: z.number(),
    lockId: z.string(),
    value: z.string(),
    keepLock: z.boolean().optional(),
  },
  async ({ rowId, lockId, value, keepLock }) => {
    const result = await metricsProcessor.writeRow({ rowId, lockId, value, keepLock });
    auditLogger.log({ action: 'write_row', clientId: 'mcp-client', template: 'metrics', rowId, lockId, outcome: result.ok ? 'success' : 'error' });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

server.tool(
  'unlock-row',
  'Release a lock on a row without writing. Use if you need to abort an audit.',
  {
    template: z.enum(['checklist', 'metrics']),
    rowId: z.number(),
    lockId: z.string(),
  },
  async ({ template, rowId, lockId }) => {
    const result = lockManager.release(template, rowId, lockId);
    auditLogger.log({ action: 'unlock', clientId: 'mcp-client', template, rowId, lockId, outcome: result.ok ? 'success' : 'error' });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

server.tool(
  'extend-lock',
  'Extend the expiry of an active row lock (heartbeat). Call this if your audit is taking longer than 10 minutes.',
  {
    template: z.enum(['checklist', 'metrics']),
    rowId: z.number(),
    lockId: z.string(),
  },
  async ({ template, rowId, lockId }) => {
    const result = lockManager.extend(template, rowId, lockId);
    auditLogger.log({ action: 'extend_lock', clientId: 'mcp-client', template, rowId, lockId, outcome: result.ok ? 'success' : 'error' });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

server.tool(
  'chromedevtools-audit',
  'Browser-based audit helper. This tool does NOT run browser actions directly — instead, use the Chrome DevTools MCP tools available in your editor environment for browser inspection. Call this tool to log the audit action for observability.',
  {
    description: z.string().describe('Description of the browser audit action performed via Chrome DevTools MCP'),
    rowId: z.number().optional(),
    lockId: z.string().optional(),
    template: z.string().optional(),
  },
  async ({ description, rowId, lockId, template }) => {
    auditLogger.log({ action: 'tool_invoke', clientId: 'mcp-client', template, rowId, lockId, outcome: 'success', details: { tool: 'chromedevtools-audit', description } });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ok: true,
          message: 'Use Chrome DevTools MCP tools in your editor environment for browser inspection. Available tools include navigation, DOM queries, screenshots, JavaScript evaluation, and network inspection. This tool logged the audit action for observability.',
          logged: { description, rowId, template },
        }),
      }],
    };
  }
);

server.tool(
  'run-local-audit',
  'Run a local shell command in the workspace to audit code (e.g., lint, grep, test). Returns stdout/stderr. Command is sandboxed to the workspace directory.',
  {
    command: z.string(),
    cwd: z.string().optional(),
    timeoutMs: z.number().optional(),
    rowId: z.number().optional(),
    lockId: z.string().optional(),
    template: z.string().optional(),
  },
  async ({ command, cwd, timeoutMs, rowId, lockId, template }) => {
    auditLogger.log({ action: 'tool_invoke', clientId: 'mcp-client', template, rowId, lockId, outcome: 'started', details: { tool: 'run-local-audit', command } });
    const result = await localAuditTool.execute({ command, cwd, timeoutMs });
    auditLogger.log({ action: 'tool_invoke', clientId: 'mcp-client', template, rowId, lockId, outcome: result.ok ? 'success' : 'error', details: { tool: 'run-local-audit' } });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

server.tool(
  'get-checklist-status',
  'Get progress summary for the checklist: total rows, done, pending, locked.',
  {},
  async () => {
    const result = await csvManager.getStatus('checklist');
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

server.tool(
  'get-metrics-status',
  'Get progress summary for the metrics file: total rows, filled, empty, locked.',
  {},
  async () => {
    const result = await metricsProcessor.getStatus();
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

server.tool(
  'get-row-logs',
  'Fetch the audit trail (all logged actions) for a specific row.',
  {
    template: z.enum(['checklist', 'metrics']),
    rowId: z.number(),
  },
  async ({ template, rowId }) => {
    const logs = auditLogger.getLogsForRow(template, rowId);
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, logs }) }] };
  }
);

server.tool(
  'get-observability-metrics',
  'Get server-wide observability: total actions, reads, writes, errors, lock collisions, avg audit time.',
  {},
  async () => {
    const metrics = auditLogger.getMetrics();
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, ...metrics }) }] };
  }
);

// ── Start ──

const transport = new StdioServerTransport();
await server.connect(transport);
