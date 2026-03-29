#!/usr/bin/env node

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import LockManager from './lock-manager.js';
import CsvManager from './csv-manager.js';
import LocalAuditTool from './local-audit-tool.js';
import { validatePayload } from './validator.js';
import { readFileSync } from 'fs';
import { readFile, writeFile, copyFile, access, mkdir, readdir, unlink } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import config, {
  getProjectRootForWorkspace,
  resolveWorkspaceMetricsCsvPath,
} from './config.js';
import { assertAllowedReadPath, assertAllowedWritePath, isPathInsideSandbox } from './path-guard.js';
import { computeAllMetrics } from './metrics-engine.js';
import { parseJsonLayers } from './parse-json-layers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const defaultAuditMetrics = JSON.parse(
  readFileSync(resolve(__dirname, 'default-audit-metrics.json'), 'utf8')
);
const AUDIT_DASHBOARD_URI = 'ui://ui-audit/audit-dashboard.html';
const HTML2PDF_VENDOR_URI = 'ui://ui-audit/vendor/html2pdf.bundle.min.js';
const html2pdfVendorPath = resolve(__dirname, 'progen-craft', 'design-system', 'utils', 'html2pdf.bundle.min.js');
const auditDashboardMcpHtmlPath = resolve(__dirname, '..', 'dist', 'mcp-dashboard', 'audit-dashboard-mcp.html');

async function readMcpDashboardHtml() {
  try {
    return await readFile(auditDashboardMcpHtmlPath, 'utf-8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new Error(
        'MCP dashboard HTML not found. Run `npm run build` in the ui-audit package (Vite outputs dist/mcp-dashboard/audit-dashboard-mcp.html), then retry.'
      );
    }
    throw err;
  }
}

async function buildAuditDashboardContents(uri, variables) {
  let html = await readMcpDashboardHtml();
  const raw = variables?.data ?? uri.searchParams.get('data');
  let tailScripts = '';
  if (raw) {
    try {
      let v = JSON.parse(decodeURIComponent(raw));
      v = parseJsonLayers(v);
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        if (v.metrics != null && typeof v.metrics === 'string') {
          const inner = parseJsonLayers(v.metrics);
          if (inner !== null && typeof inner === 'object' && !Array.isArray(inner)) {
            v = { ...v, metrics: inner };
          } else {
            throw new Error('invalid stringified metrics');
          }
        }
        const safe = JSON.stringify(v).replace(/</g, '\\u003c');
        tailScripts = `<script>window.__UI_AUDIT_DASHBOARD__=${safe};</script>`;
      }
    } catch {
      /* ignore invalid data param */
    }
  }
  if (tailScripts) {
    html = html.replace('</body>', `${tailScripts}</body>`);
  }
  return {
    contents: [{ uri: uri.href, mimeType: RESOURCE_MIME_TYPE, text: html }],
  };
}

const DASHBOARD_FALLBACK_PROJECT = 'Example Project Audit Report';

function projectNameFromMetrics(metrics, fallback = DASHBOARD_FALLBACK_PROJECT) {
  if (!metrics || typeof metrics !== 'object') return fallback;
  const name = metrics['metadata.projectName'];
  if (name == null) return fallback;
  const t = String(name).trim();
  return t !== '' ? t : fallback;
}

/**
 * @param {string | undefined} metricsJson - Optional JSON string: flat EDS-style metrics object, or a dashboard payload object that includes a `metrics` object.
 * @returns {{ payload: object, usedDefaultMetrics: boolean, jsonInvalid: boolean }}
 */
function resolveDashboardPayloadFromMetricsJson(metricsJson) {
  const defaultPayload = {
    projectName: projectNameFromMetrics(defaultAuditMetrics),
    metrics: defaultAuditMetrics,
  };

  if (metricsJson === undefined || metricsJson === null) {
    return { payload: defaultPayload, usedDefaultMetrics: true, jsonInvalid: false };
  }

  const trimmed = String(metricsJson).trim();
  if (trimmed === '') {
    return { payload: defaultPayload, usedDefaultMetrics: true, jsonInvalid: false };
  }

  const parsedRoot = parseJsonLayers(trimmed);
  if (parsedRoot === null || typeof parsedRoot !== 'object' || Array.isArray(parsedRoot)) {
    return { payload: defaultPayload, usedDefaultMetrics: true, jsonInvalid: true };
  }

  let parsed = parsedRoot;
  if (parsed.metrics != null && typeof parsed.metrics === 'string') {
    const inner = parseJsonLayers(parsed.metrics);
    if (inner !== null && typeof inner === 'object' && !Array.isArray(inner)) {
      parsed = { ...parsed, metrics: inner };
    } else {
      return { payload: defaultPayload, usedDefaultMetrics: true, jsonInvalid: true };
    }
  }

  if (parsed.metrics != null && typeof parsed.metrics === 'object' && !Array.isArray(parsed.metrics)) {
    const metrics = parsed.metrics;
    const projectName =
      parsed.projectName != null && String(parsed.projectName).trim() !== ''
        ? String(parsed.projectName).trim()
        : projectNameFromMetrics(metrics);
    return {
      payload: { ...parsed, projectName, metrics },
      usedDefaultMetrics: false,
      jsonInvalid: false,
    };
  }

  return {
    payload: {
      projectName: projectNameFromMetrics(parsed),
      metrics: parsed,
    },
    usedDefaultMetrics: false,
    jsonInvalid: false,
  };
}

/**
 * Read flat metrics from workspace Metrics.csv (key,value rows). Returns null if missing/unreadable/empty keys.
 * Pass `getWorkspaceMetricsCsvPath()` so reads match `write-metrics` and `CsvManager` metrics paths.
 * @param {string} metricsCsvPath
 * @returns {Promise<Record<string, string> | null>}
 */
async function tryLoadMetricsFromMetricsCsv(metricsCsvPath) {
  const pathCheck = assertAllowedReadPath(metricsCsvPath);
  if (!pathCheck.ok) return null;
  try {
    const content = await readFile(metricsCsvPath, 'utf-8');
    const clean = content.replace(/^\uFEFF/, '');
    const { parse: csvParse } = await import('csv-parse/sync');
    const records = csvParse(clean, { columns: true, skip_empty_lines: true, bom: true });
    const metrics = {};
    for (const row of records) {
      const key = row['key'];
      if (key == null || String(key).trim() === '') continue;
      const val = row['value'];
      metrics[String(key).trim()] = val == null ? '' : String(val);
    }
    if (Object.keys(metrics).length === 0) return null;
    return metrics;
  } catch {
    return null;
  }
}

/**
 * Dashboard data source: workspace Metrics.csv first, then metricsJson, then default-audit-metrics.json.
 * @param {string | undefined} metricsJson
 * @param {{ workspacePath?: string, projectPath?: string } | undefined} metricsCsvOverrides - Same semantics as `write-metrics` / `compute-metrics` paths.
 * @returns {Promise<{ payload: object, usedDefaultMetrics: boolean, jsonInvalid: boolean, dataSource: 'csv' | 'json' | 'default' }>}
 */
async function resolveDashboardPayloadForDisplay(metricsJson, metricsCsvOverrides) {
  const fromCsv = await tryLoadMetricsFromMetricsCsv(
    resolveWorkspaceMetricsCsvPath(metricsCsvOverrides)
  );
  if (fromCsv !== null) {
    return {
      payload: {
        projectName: projectNameFromMetrics(fromCsv),
        metrics: fromCsv,
      },
      usedDefaultMetrics: false,
      jsonInvalid: false,
      dataSource: 'csv',
    };
  }
  const fromJson = resolveDashboardPayloadFromMetricsJson(metricsJson);
  return {
    payload: fromJson.payload,
    usedDefaultMetrics: fromJson.usedDefaultMetrics,
    jsonInvalid: fromJson.jsonInvalid,
    dataSource: fromJson.usedDefaultMetrics ? 'default' : 'json',
  };
}


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

server.registerResource(
  'metrics-template',
  'audit://templates/metrics',
  { description: 'The Metrics output template CSV (key-value pairs derived from Code Audit and Browser Audit results).' },
  async (uri) => {
    const content = await readFile(resolve(config.templatesDir, config.templates['metrics']), 'utf-8');
    return { contents: [{ uri: uri.href, mimeType: 'text/csv', text: content }] };
  }
);

registerAppResource(
  server,
  'Audit Dashboard',
  AUDIT_DASHBOARD_URI,
  {
    description:
      'Interactive MCP App view for UI audit results. Without ?data=, the embedded app uses server default metrics (default-audit-metrics.json). Use the parameterized resource or display-audit-dashboard tool to pass URL-encoded JSON in the data query param (dashboard payload with at least metrics).',
  },
  async (uri) => buildAuditDashboardContents(uri, undefined)
);

server.registerResource(
  'Audit Dashboard (parameterized)',
  new ResourceTemplate(`${AUDIT_DASHBOARD_URI}{?data}`, {}),
  {
    description:
      'Audit dashboard HTML with optional URL-encoded JSON in the `data` query param (encodeURIComponent of JSON: flat metrics object or full payload with `metrics`). Omit data to load the same HTML as the base resource; the UI then uses built-in default metrics.',
    mimeType: RESOURCE_MIME_TYPE,
  },
  async (uri, variables) => buildAuditDashboardContents(uri, variables)
);

server.registerResource(
  'html2pdf-vendor',
  HTML2PDF_VENDOR_URI,
  {
    description: 'html2pdf.js bundle for audit dashboard PDF export.',
    mimeType: 'application/javascript',
  },
  async (uri) => {
    const text = await readFile(html2pdfVendorPath, 'utf-8');
    return {
      contents: [{ uri: uri.href, mimeType: 'application/javascript', text }],
    };
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
5. When pending = 0, call \`cleanup-workspace\` — removes any auto-generated JSON, MD, and Python files, keeping only CSVs.
6. Report a brief summary to the user.

## Rules
- ONE row at a time. No batching.
- Only \`run-local-audit\` — no browser tools.
- Failed commands: mark "No" with the failure reason, move on. Do NOT retry more than once.
- Never stop mid-audit.
- **Verify every checklist item manually using grep/cat/file inspection, even when the rule is not automatically enforced by tools like ESLint or Stylelint.** Do not skip an item just because no linter covers it — read the source and judge directly.

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
6. When pending = 0, call \`cleanup-workspace\` — removes any auto-generated JSON, MD, and Python files, keeping only CSVs.
7. Report a brief summary to the user.

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

server.registerPrompt(
  'show-audit-dashboard',
  {
    description:
      'Open the Audit Dashboard MCP App (interactive UI). Invokes the display-audit-dashboard tool so the host can render ui://ui-audit/audit-dashboard.html.',
  },
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Open the **Audit Dashboard** in the MCP App UI.

## What to do
1. Call the MCP tool **\`display-audit-dashboard\`** now.
2. Omit \`metricsJson\` or pass \`""\` to load the built-in sample metrics from the server (\`default-audit-metrics.json\`).
3. To show real audit data, pass a single argument \`metricsJson\`: a **JSON string** (use \`JSON.stringify\`) of either:
   - the flat metrics object (EDS-style keys: \`metadata.projectName\`, \`summary.*\`, \`overallScores.*\`, \`overallStatus.*\`, etc.), or
   - a full dashboard payload object that includes a \`metrics\` property (optional \`projectName\`, \`domains\`, \`locale\`, etc.).

## After the tool returns
- The tool response includes MCP App metadata (\`_meta.ui.resourceUri\`) pointing at \`ui://ui-audit/audit-dashboard.html\` (with \`?data=...\` when the JSON is small enough).
- Ensure the host **opens or focuses** that MCP App / UI resource so the user sees the dashboard.
- Summarize in one short line what is shown (project name, RAG if present, checklist totals if present).

Do not ask follow-up questions unless the user's request was ambiguous about which metrics to show.`,
        },
      },
    ],
  })
);

server.registerPrompt(
  'generate-report',
  {
    description: 'Generate a full Metrics report from completed Code Audit, Browser Audit, and Manual Checklist results. Asks for project metadata before beginning.',
  },
  () => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `You are a UI audit agent preparing to generate a **Full Metrics Report** from all three completed audit sources: Code Audit, Browser Audit, and Manual Checklist.

**Before doing anything else**, ask the user exactly these questions (all at once):

> 1. Project name:
> 2. App URL (the URL audited in the Browser Audit, or leave blank):
> 3. Auditor name (or leave blank):
> 4. Project type — one of: **New Build**, **Migration**, **Enhancement**, **Revamp** (or leave blank):
> 5. Project manager (or leave blank):
> 6. Architect / lead (or leave blank):
> 7. Current phase — one of: **Discovery**, **Design**, **Development**, **Testing**, **Go-Live** (or leave blank):
> 8. Path to filled Code Audit CSV (or leave blank to auto-detect from .ui-audit/):
> 9. Path to filled Browser Audit CSV (or leave blank to auto-detect from .ui-audit/):
> 10. Path to filled Manual Checklist CSV (or leave blank to auto-detect from .ui-audit/):

Wait for their response. Then proceed with the full workflow below without any further pauses or questions.

---

## CRITICAL: Run to completion without stopping
Complete the entire metrics generation in a single continuous run.
Do NOT pause, ask questions, or wait for user input at any point after receiving metadata.

## Workflow

### Step 1 — Prepare workspace and auto-derive metadata
1. \`set-audit-workspace\` with \`templateName: "metrics"\` — creates \`.ui-audit/\` and copies the metrics template.
2. \`download-template\` with \`templateName: "metrics"\` — seeds a fresh metrics file.
3. Auto-derive repoUrl using \`run-local-audit\`:
   - run \`git remote get-url origin\`; use stdout. If unavailable, use "".

### Step 2 — Compute all metrics (server-side)
4. Call \`compute-metrics\` with:
   - \`projectName\`: from user answer
   - \`appUrl\`: from user answer (or "")
   - \`repoUrl\`: from the git command above (or "")
   - \`auditorName\`: from user answer (or "")
   - \`projectType\`: from user answer — New Build | Migration | Enhancement | Revamp (or "")
   - \`projectManager\`: from user answer (or "")
   - \`architectLead\`: from user answer (or "")
   - \`currentPhase\`: from user answer — Discovery | Design | Development | Testing | Go-Live (or "")
   - \`codeAuditPath\`: from user answer (omit if blank — tool auto-detects from .ui-audit/)
   - \`browserAuditPath\`: from user answer (omit if blank — tool auto-detects from .ui-audit/)
   - \`manualAuditPath\`: from user answer (omit if blank — tool auto-detects from .ui-audit/)
   This tool reads all three checklists (code-audit, browser-audit, manual-audit) automatically, computes every metric (summaries, domain scores, weighted overall score, granular per-item values, risk index, RAG status, top issues, components requiring attention), and returns the full flat key-value object. When explicit paths are provided, those files are used directly; otherwise, the tool looks in .ui-audit/ then falls back to the templates directory. Missing audit files are skipped gracefully.

### Step 3 — Write metrics
5. Extract the \`metrics\` object from the \`compute-metrics\` response.
6. \`write-metrics\` with the \`metrics\` object — writes all values to the Metrics CSV.

### Step 4 — Show audit dashboard
7. Call \`display-audit-dashboard\` with \`metricsJson: JSON.stringify(metrics)\` where \`metrics\` is the flat key-value object from \`compute-metrics\`.

### Step 5 — Cleanup
8. \`cleanup-workspace\` — removes any auto-generated JSON, MD, and Python files, keeping only CSVs.

### Step 6 — Report
9. Print a concise summary table: RAG rating, go-live readiness, overall score, all 17 domain scores with their risk ratings, criticalFailed count, mandatoryFailed count, totalBlockingIssues, and the path to the generated metrics file.

## Rules
- Do NOT manually compute metrics — \`compute-metrics\` handles all computation server-side.
- Leave a metric value as "" if it cannot be derived — do NOT guess or fabricate.
- Never stop mid-generation.

Begin immediately.`,
      },
    }],
  })
);

// ── Tools ──

registerAppTool(
  server,
  'display-audit-dashboard',
  {
    title: 'Audit dashboard',
    description:
      'Opens the Audit MCP App (ui://…/audit-dashboard.html). Data source order: (1) Metrics.csv from the resolved audit path (see `projectPath` / `workspacePath`; else `UI_AUDIT_PROJECT_ROOT` env + `.ui-audit/`, else `set-audit-workspace` target, else `process.cwd()` + `.ui-audit/`). If that file parses successfully, its rows drive the dashboard (metricsJson ignored). (2) Else `metricsJson`. (3) Else built-in sample metrics. Invalid JSON in step 2 falls back to step 3.',
    inputSchema: {
      projectPath: z
        .string()
        .optional()
        .describe(
          'Absolute path to the project repo root containing `.ui-audit/`. Use when the MCP process cwd is not the repo (e.g. Cursor). Metrics.csv is read from `<projectPath>/.ui-audit/Metrics.csv`. Omit if `UI_AUDIT_PROJECT_ROOT` or `set-audit-workspace` already points at this project.'
        ),
      workspacePath: z
        .string()
        .optional()
        .describe(
          'Absolute path to the audit folder that **contains** Metrics.csv (usually `<repo>/.ui-audit`). Overrides `projectPath` when both are set. Same meaning as `compute-metrics` workspacePath.'
        ),
      metricsJson: z
        .string()
        .optional()
        .describe(
          'Optional JSON string used only when Metrics.csv is missing or unreadable at the resolved path: (1) flat metrics object, or (2) dashboard payload with a `metrics` object. Omit or "" for built-in sample metrics in that case. Malformed JSON uses defaults.'
        ),
    },
    _meta: { ui: { resourceUri: AUDIT_DASHBOARD_URI } },
  },
  async (args) => {
    if (args?.workspacePath || args?.projectPath) {
      const metricsCsvPath = resolveWorkspaceMetricsCsvPath({
        workspacePath: args?.workspacePath,
        projectPath: args?.projectPath,
      });
      const pathCheck = assertAllowedReadPath(metricsCsvPath);
      if (!pathCheck.ok) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ok: false,
                error: pathCheck.error,
                message: pathCheck.message,
              }),
            },
          ],
        };
      }
    }
    const { payload, usedDefaultMetrics, jsonInvalid, dataSource } = await resolveDashboardPayloadForDisplay(
      args?.metricsJson,
      { workspacePath: args?.workspacePath, projectPath: args?.projectPath }
    );
    const dataJson = JSON.stringify(payload);
    const dataEnc = encodeURIComponent(dataJson);
    const resourceWithData =
      dataJson.length < 6000 ? `${AUDIT_DASHBOARD_URI}?data=${dataEnc}` : AUDIT_DASHBOARD_URI;

    const hint =
      dataSource === 'csv'
        ? ' Loaded from .ui-audit/Metrics.csv (metricsJson ignored if present).'
        : jsonInvalid
          ? ' Invalid metricsJson — using default-audit-metrics.json.'
          : usedDefaultMetrics
            ? ' Using default sample metrics (no Metrics.csv; empty or omitted metricsJson).'
            : '';

    return {
      content: [
        {
          type: 'text',
          text: `Audit dashboard: ${payload.projectName}${payload.metrics?.['overallStatus.ragRating'] != null ? `; RAG ${payload.metrics['overallStatus.ragRating']}` : ''}${payload.metrics?.['summary.totalChecks'] != null ? `; ${payload.metrics['summary.totalChecks']} checks` : ''}. Open the MCP App resource for the full view.${hint}`,
        },
      ],
      structuredContent: {
        auditDashboard: payload,
      },
      _meta: {
        ui: { resourceUri: resourceWithData },
      },
    };
  }
);

server.registerTool(
  'set-audit-workspace',
  {
    description: 'Set the project being audited. Creates a .ui-audit/ folder, copies the relevant checklist, and redirects all read/write to it. Call this FIRST.',
    inputSchema: {
      templateName: z.enum(['code-audit', 'browser-audit', 'manual-audit', 'metrics']).describe('Which audit is being run: "code-audit", "browser-audit", "manual-audit", or "metrics".'),
      projectPath: z
        .string()
        .optional()
        .describe(
          'Absolute path to the project repo. Omit to use `UI_AUDIT_PROJECT_ROOT` / `MCP_UI_AUDIT_PROJECT_ROOT` if set, otherwise `process.cwd()`.'
        ),
    },
  },
  async ({ templateName, projectPath }) => {
    const base = projectPath ? resolve(String(projectPath).trim()) : getProjectRootForWorkspace();
    if (!isPathInsideSandbox(base)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: 'PATH_NOT_ALLOWED',
              message:
                'projectPath must be under the trusted project root (same as UI_AUDIT_PROJECT_ROOT / cwd when the server started).',
            }),
          },
        ],
      };
    }
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
      templateName: z.enum(['code-audit', 'browser-audit', 'manual-audit', 'metrics']).describe('Which template to download: "code-audit", "browser-audit", "manual-audit", or "metrics".'),
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
  'read-full-checklist',
  {
    description: 'Read ALL rows from a completed audit checklist at once. Returns the full row array as JSON. Use this for metrics generation — do NOT use read-checklist-row one row at a time for analysis.',
    inputSchema: {
      templateName: z.enum(['code-audit', 'browser-audit', 'manual-audit']).describe('Which completed checklist to read: "code-audit", "browser-audit", or "manual-audit".'),
    },
  },
  async ({ templateName }) => {
    const filename = config.templates[templateName];
    const filePath = resolve(config.workspaceDir, filename);
    let content;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch {
      return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'FILE_NOT_FOUND', path: filePath, hint: 'Run set-audit-workspace and complete the audit first.' }) }] };
    }
    const { parse: csvParse } = await import('csv-parse/sync');
    const records = csvParse(content, { columns: true, skip_empty_lines: true });
    return {
      content: [{ type: 'text', text: JSON.stringify({ ok: true, template: templateName, total: records.length, rows: records }) }],
    };
  }
);

server.registerTool(
  'write-metrics',
  {
    description:
      'Write computed metric values to Metrics.csv—the same file `display-audit-dashboard` reads first. Path: `workspacePath` or `projectPath` when provided; otherwise `config.workspaceDir` (from `UI_AUDIT_PROJECT_ROOT` / `set-audit-workspace` / cwd). Flat key-value object; keys match dot-notation keys in the template. Unrecognised keys are ignored.',
    inputSchema: {
      projectPath: z
        .string()
        .optional()
        .describe(
          'Absolute repo root containing `.ui-audit/`. Writes `<projectPath>/.ui-audit/Metrics.csv`. Use when MCP cwd is not the project.'
        ),
      workspacePath: z
        .string()
        .optional()
        .describe(
          'Absolute path to the folder containing Metrics.csv (the `.ui-audit` directory). Overrides `projectPath` when both are set.'
        ),
      metrics: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).describe('Flat key-value object of computed metric values, e.g. { "metadata.projectName": "MyApp", "overallScores.uiQualityScore": 78.5 }.'),
    },
  },
  async ({ metrics, workspacePath, projectPath }) => {
    const filePath = resolveWorkspaceMetricsCsvPath({ workspacePath, projectPath });
    const writeCheck = assertAllowedWritePath(filePath);
    if (!writeCheck.ok) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: writeCheck.error,
              message: writeCheck.message,
            }),
          },
        ],
      };
    }
    let content;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch {
      return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'METRICS_FILE_NOT_FOUND', path: filePath, hint: 'Run set-audit-workspace and download-template with templateName "metrics" first.' }) }] };
    }
    const { parse: csvParse } = await import('csv-parse/sync');
    const { stringify: csvStringify } = await import('csv-stringify/sync');
    const records = csvParse(content, { columns: true, skip_empty_lines: true });

    let written = 0;
    for (const row of records) {
      const key = row['key'];
      if (key in metrics) {
        row['value'] = String(metrics[key]);
        written++;
      }
    }

    const csv = csvStringify(records, { header: true, columns: ['key', 'value'] });
    await writeFile(filePath, csv, 'utf-8');

    return {
      content: [{ type: 'text', text: JSON.stringify({ ok: true, path: filePath, totalKeys: records.length, written }) }],
    };
  }
);

server.registerTool(
  'compute-metrics',
  {
    description:
      'Read all completed audit checklists (code-audit, browser-audit, manual-audit) and compute every metric value deterministically. Returns the full flat key-value object ready to pass to write-metrics and display-audit-dashboard (as metricsJson: JSON.stringify(metrics)). Missing audit files are skipped gracefully.',
    inputSchema: {
      projectName: z.string().optional().describe('Project name for metadata.'),
      appUrl: z.string().optional().describe('App URL audited in browser audit.'),
      repoUrl: z.string().optional().describe('Git remote URL. Auto-derived if omitted.'),
      auditorName: z.string().optional().describe('Name of the auditor.'),
      auditDate: z.string().optional().describe('ISO date string. Defaults to today.'),
      projectType: z
        .string()
        .optional()
        .describe(
          'Project type: New Build, Migration, Enhancement, or Revamp (free text; stored in metadata.projectType).'
        ),
      projectManager: z.string().optional().describe('Project manager name (metadata.projectManager).'),
      architectLead: z.string().optional().describe('Architect or technical lead (metadata.architectLead).'),
      currentPhase: z
        .string()
        .optional()
        .describe(
          'Current delivery phase: Discovery, Design, Development, Testing, or Go-Live (free text; metadata.currentPhase).'
        ),
      workspacePath: z.string().optional().describe('Absolute path to directory containing filled checklist CSVs. Defaults to .ui-audit/ workspace.'),
      codeAuditPath: z.string().optional().describe('Absolute path to a filled Code Audit CSV. Overrides workspace lookup for code-audit.'),
      browserAuditPath: z.string().optional().describe('Absolute path to a filled Browser Audit CSV. Overrides workspace lookup for browser-audit.'),
      manualAuditPath: z.string().optional().describe('Absolute path to a filled Manual Checklist CSV. Overrides workspace lookup for manual-audit.'),
    },
  },
  async ({
    projectName,
    appUrl,
    repoUrl,
    auditorName,
    auditDate,
    projectType,
    projectManager,
    architectLead,
    currentPhase,
    workspacePath,
    codeAuditPath,
    browserAuditPath,
    manualAuditPath,
  }) => {
    const { parse: csvParse } = await import('csv-parse/sync');
    const warnings = [];
    const baseDir =
      workspacePath != null && String(workspacePath).trim() !== ''
        ? resolve(String(workspacePath).trim())
        : config.workspaceDir;
    const baseCheck = assertAllowedReadPath(baseDir);
    if (!baseCheck.ok) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: baseCheck.error,
              message: baseCheck.message,
            }),
          },
        ],
      };
    }

    for (const [param, p] of [
      ['codeAuditPath', codeAuditPath],
      ['browserAuditPath', browserAuditPath],
      ['manualAuditPath', manualAuditPath],
    ]) {
      if (p != null && String(p).trim() !== '') {
        const abs = resolve(String(p).trim());
        const explicitCheck = assertAllowedReadPath(abs);
        if (!explicitCheck.ok) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ok: false,
                  error: explicitCheck.error,
                  message: explicitCheck.message,
                  param,
                  path: abs,
                }),
              },
            ],
          };
        }
      }
    }

    const loadCsv = async (filePath) => {
      const content = await readFile(filePath, 'utf-8');
      // Strip UTF-8 BOM (\uFEFF) — common in CSVs exported from Excel/Sheets
      const clean = content.replace(/^\uFEFF/, '');
      return csvParse(clean, { columns: true, skip_empty_lines: true, bom: true });
    };

    const loadChecklist = async (templateName, explicitPath) => {
      // If an explicit path is provided, use it directly
      if (explicitPath) {
        const absExplicit = resolve(String(explicitPath).trim());
        try {
          const rows = await loadCsv(absExplicit);
          return rows;
        } catch (e) {
          warnings.push(`${templateName}: explicit path ${explicitPath} failed — ${e.message}`);
          return [];
        }
      }
      // Otherwise try workspace, then templates dir as fallback
      const filename = config.templates[templateName];
      const candidates = [
        resolve(baseDir, filename),
        resolve(config.templatesDir, filename),
      ];
      for (const candidate of candidates) {
        try {
          const rows = await loadCsv(candidate);
          if (candidate !== candidates[0]) {
            warnings.push(`${templateName}: not found in workspace, loaded from templates dir (${candidate}).`);
          }
          return rows;
        } catch {
          // try next candidate
        }
      }
      warnings.push(`${templateName} not found in workspace (${baseDir}) or templates (${config.templatesDir}) — skipped.`);
      return [];
    };

    const [codeRows, browserRows, manualRows] = await Promise.all([
      loadChecklist('code-audit', codeAuditPath),
      loadChecklist('browser-audit', browserAuditPath),
      loadChecklist('manual-audit', manualAuditPath),
    ]);

    const metrics = computeAllMetrics(codeRows, browserRows, manualRows, {
      projectName: projectName || '',
      appUrl: appUrl || '',
      repoUrl: repoUrl || '',
      auditorName: auditorName || '',
      auditDate: auditDate || '',
      projectType: projectType || '',
      projectManager: projectManager || '',
      architectLead: architectLead || '',
      currentPhase: currentPhase || '',
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ok: true,
          metrics,
          sources: {
            codeAudit: codeRows.length,
            browserAudit: browserRows.length,
            manualAudit: manualRows.length,
          },
          warnings,
        }),
      }],
    };
  }
);

server.registerTool(
  'cleanup-workspace',
  {
    description: 'Remove auto-generated JSON, MD, and Python files from the audit workspace, keeping only CSV files. Call this after an audit or metrics generation completes.',
    inputSchema: {},
  },
  async () => {
    let deleted = [];
    try {
      const files = await readdir(config.workspaceDir);
      for (const file of files) {
        if (file.endsWith('.json') || file.endsWith('.md') || file.endsWith('.py')) {
          await unlink(resolve(config.workspaceDir, file));
          deleted.push(file);
        }
      }
    } catch (e) {
      return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: e.message }) }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, deleted, count: deleted.length }) }] };
  }
);

server.registerTool(
  'run-local-audit',
  {
    description:
      'Run a single allowlisted CLI (no shell): grep/rg/cat/head/tail/git/eslint/node/find/etc. No pipes (|), &&, ;, or subshells. cwd must stay under the trusted project root.',
    inputSchema: {
      command: z
        .string()
        .describe(
          'Single command with optional quoted arguments only (e.g. grep -r pattern .). Shell operators and pipes are rejected.'
        ),
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
