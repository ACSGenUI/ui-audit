#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import LockManager from './lock-manager.js';
import CsvManager from './csv-manager.js';
import LocalAuditTool from './local-audit-tool.js';
import { validatePayload } from './validator.js';
import { readFile, copyFile, access, mkdir } from 'fs/promises';
import { resolve } from 'path';
import config from './config.js';


const lockManager = new LockManager();
const csvManager = new CsvManager(lockManager);
const localAuditTool = new LocalAuditTool();

const server = new McpServer({ name: 'ui-audit', version: '1.0.0' });

// ── Resources ──

server.registerResource(
  'code-audit-template',
  'audit://templates/code-audit',
  { description: 'The Code Audit checklist CSV.' },
  async (uri) => {
    const content = await readFile(resolve(config.templatesDir, config.templates['code-audit']), 'utf-8');
    return { contents: [{ uri: uri.href, mimeType: 'text/csv', text: content }] };
  }
);

server.registerResource(
  'browser-audit-template',
  'audit://templates/browser-audit',
  { description: 'The Browser Audit checklist CSV.' },
  async (uri) => {
    const content = await readFile(resolve(config.templatesDir, config.templates['browser-audit']), 'utf-8');
    return { contents: [{ uri: uri.href, mimeType: 'text/csv', text: content }] };
  }
);

// ── Prompts ──

server.registerPrompt(
  'start-code-audit',
  {
    description: 'Start a Code Audit against the current working directory. No input required.',
  },
  () => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `You are a UI audit agent running a **Code Audit**.

## CRITICAL: Run to completion without stopping
Process ALL rows in a single continuous run.
Do NOT pause, summarise, ask questions, or wait for user input at any point.
The audit is only complete when \`get-checklist-status\` returns \`pending: 0\`.

## Workflow
1. \`set-audit-workspace\` with \`templateName: "code-audit"\` — creates \`.ui-audit/\` in the current working directory and copies the Code Audit checklist.
2. \`download-template\` with \`templateName: "code-audit"\` — seeds a fresh checklist.
3. \`get-checklist-status\` — confirm starting row count.
4. Loop until pending = 0:
   a. \`read-checklist-row\` with \`mode: "next_unchecked"\`
   b. Run \`run-local-audit\` with grep/eslint/cat commands using the cwd from step 1
   c. \`write-checklist-row\` with the same rowId/lockId — fill \`implemented\`, \`comments\`, \`evidence\`
   d. Discard row content from context immediately after writing.
   e. Every 10 rows call \`get-checklist-status\` silently — do NOT report to user, continue immediately.
5. When pending = 0, report a brief summary to the user.

## Rules
- ONE row at a time. No batching.
- Only \`run-local-audit\` — no browser tools.
- Failed commands: mark "No" with the failure reason, move on. Do NOT retry more than once.
- Never stop mid-audit.

Begin immediately.`,
      },
    }],
  })
);

server.registerPrompt(
  'start-browser-audit',
  {
    description: 'Start a Browser Audit using Chrome DevTools. Asks for the App URL before beginning.',
  },
  () => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `You are a UI audit agent preparing to run a **Browser Audit**.

**Before doing anything else**, ask the user exactly this:

> "Please enter the App URL to audit (e.g. https://example.com):"

Wait for their response. Once you have the URL, proceed with the full workflow below without any further pauses or questions.

---

## CRITICAL: Run to completion without stopping
Process ALL rows in a single continuous run after receiving the URL.
Do NOT pause, summarise, ask questions, or wait for user input at any point during the audit.
The audit is only complete when \`get-checklist-status\` returns \`pending: 0\` for template \`browser-audit\`.

## Workflow (after receiving the App URL)
1. \`set-audit-workspace\` with \`templateName: "browser-audit"\` — creates \`.ui-audit/\` in the current working directory and copies the Browser Audit checklist.
2. \`download-template\` with \`templateName: "browser-audit"\` — seeds a fresh browser checklist.
3. \`get-checklist-status\` with \`templateName: "browser-audit"\` — confirm starting row count.
4. Navigate Chrome DevTools to the App URL before starting the loop.
5. Loop until pending = 0:
   a. \`read-checklist-row\` with \`mode: "next_unchecked"\` and \`templateName: "browser-audit"\`
   b. Use Chrome DevTools MCP tools to inspect the page (accessibility tree, console errors, network requests, lighthouse, etc.)
   c. \`write-checklist-row\` with the same rowId/lockId and \`templateName: "browser-audit"\` — fill \`implemented\` (Yes / No), \`comments\`, \`evidence\`
   d. Discard row content from context immediately after writing.
   e. Every 10 rows call \`get-checklist-status\` with \`templateName: "browser-audit"\` silently — do NOT report to user, continue immediately.
6. When pending = 0, report a brief summary to the user.

## Rules
- ONE row at a time. No batching.
- Use Chrome DevTools MCP tools only — no \`run-local-audit\` for browser checks.
- \`implemented\` must be "Yes" or "No".
- Failed inspections: mark "No" with the failure reason, move on. Do NOT retry more than once.
- Never stop mid-audit.`,
      },
    }],
  })
);

// ── Tools ──

server.registerTool(
  'set-audit-workspace',
  {
    description: 'Set the project being audited. Creates a .ui-audit/ folder, copies the relevant checklist, and redirects all read/write to it. Call this FIRST.',
    inputSchema: {
      templateName: z.enum(['code-audit', 'browser-audit']).describe('Which audit is being run: "code-audit" or "browser-audit".'),
      projectPath: z.string().optional().describe('Absolute path to the project repo. Omit to use the current working directory.'),
    },
  },
  async ({ templateName, projectPath }) => {
    const base = projectPath || process.cwd();
    const auditDir = resolve(base, '.ui-audit');

    await mkdir(auditDir, { recursive: true });

    const filename = config.templates[templateName];
    const src = resolve(config.templatesDir, filename);
    const dest = resolve(auditDir, filename);
    try {
      await access(dest);
    } catch {
      await copyFile(src, dest);
    }

    config.workspaceDir = auditDir;

    return {
      content: [{ type: 'text', text: JSON.stringify({ ok: true, auditDir, template: filename }) }],
    };
  }
);

server.registerTool(
  'download-template',
  {
    description: 'Copy a fresh checklist from templates into the workspace, overwriting any existing file. Returns path, columns, and row count.',
    inputSchema: {
      templateName: z.enum(['code-audit', 'browser-audit']).describe('Which checklist to download: "code-audit" or "browser-audit".'),
    },
  },
  async ({ templateName }) => {
    const filename = config.templates[templateName];
    const src = resolve(config.templatesDir, filename);
    const dest = resolve(config.workspaceDir, filename);
    await copyFile(src, dest);
    const result = await csvManager.download(templateName);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  'read-checklist-row',
  {
    description: 'Read one checklist row and acquire a lock. Returns fields, rowId, and lockId needed for write-checklist-row.',
    inputSchema: {
      mode: z.enum(['next_unchecked', 'by_row_id']).describe('"next_unchecked" picks the next unprocessed row; "by_row_id" fetches a specific row'),
      rowId: z.number().optional().describe('Row index (0-based). Required when mode is "by_row_id".'),
      templateName: z.enum(['code-audit', 'browser-audit']).describe('Which checklist to read from: "code-audit" or "browser-audit".'),
    },
  },
  async ({ mode, rowId, templateName }) => {
    const result = await csvManager.readRow(templateName, { mode, rowId, clientId: 'mcp-client' });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  'write-checklist-row',
  {
    description: 'Write audit results for one row. Requires rowId and lockId from read-checklist-row. Releases the lock on success.',
    inputSchema: {
      rowId: z.number().describe('Row index returned by read-checklist-row.'),
      lockId: z.string().describe('Lock ID returned by read-checklist-row.'),
      implemented: z.enum(['Yes', 'No', 'yes', 'no']).describe('Whether the checklist item is implemented.'),
      comments: z.string().max(2000).describe('Brief explanation of the finding.'),
      evidence: z.string().describe('URL, workspace-relative file path, or empty string.'),
      templateName: z.enum(['code-audit', 'browser-audit']).describe('Which checklist to write to: "code-audit" or "browser-audit".'),
    },
  },
  async ({ rowId, lockId, implemented, comments, evidence, templateName }) => {
    const payload = {
      'Implemented? (Yes / No)': implemented,
      'Comments': comments,
      'Evidence': evidence,
    };
    const validation = validatePayload(payload);
    if (!validation.valid) {
      return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'VALIDATION_FAILED', errors: validation.errors }) }] };
    }
    const result = await csvManager.writeRow(templateName, { rowId, lockId, payload: validation.payload });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  'get-checklist-status',
  {
    description: 'Get current audit progress: total rows, done, pending, and locked.',
    inputSchema: {
      templateName: z.enum(['code-audit', 'browser-audit']).describe('Which checklist to check: "code-audit" or "browser-audit".'),
    },
  },
  async ({ templateName }) => {
    const result = await csvManager.getStatus(templateName);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  'unlock-row',
  {
    description: 'Release a lock on a row without writing. Use only when aborting a row mid-audit.',
    inputSchema: {
      rowId: z.number().describe('Row index to unlock.'),
      lockId: z.string().describe('Lock ID to release.'),
      templateName: z.enum(['code-audit', 'browser-audit']).describe('Which checklist the lock belongs to: "code-audit" or "browser-audit".'),
    },
  },
  async ({ rowId, lockId, templateName }) => {
    const result = lockManager.release(templateName, rowId, lockId);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  'run-local-audit',
  {
    description: 'Run a read-only shell command against the project repo (grep, cat, eslint, etc). Returns stdout and stderr.',
    inputSchema: {
      command: z.string().describe('Shell command to run.'),
      cwd: z.string().optional().describe('Absolute path to the project being audited. Defaults to the audit workspace.'),
      timeoutMs: z.number().optional().describe('Max execution time in milliseconds. Defaults to 60000.'),
    },
  },
  async ({ command, cwd, timeoutMs }) => {
    const result = await localAuditTool.execute({ command, cwd, timeoutMs });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// ── Start ──

const transport = new StdioServerTransport();
await server.connect(transport);
