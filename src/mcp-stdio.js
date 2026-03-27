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
import { computeAllMetrics } from './metrics-engine.js';

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

/** Repeatedly JSON.parse while the value is a non-empty string (double-encoded JSON from clients). */
function parseJsonLayers(value, maxDepth = 12) {
  let v = value;
  let depth = 0;
  while (depth < maxDepth && typeof v === 'string') {
    const t = v.trim();
    if (t === '') return null;
    try {
      v = JSON.parse(t);
      depth += 1;
    } catch {
      return null;
    }
  }
  return v;
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
  'start-metrics-generation-v1',
  {
    description: '[Legacy] Generate a Metrics report from Code Audit and Browser Audit results only. Use start-metrics-generation for the full three-audit report.',
  },
  () => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `You are a UI audit agent preparing to generate a **Metrics Report** from completed audit results.

**Before doing anything else**, ask the user exactly these questions (all at once):

> 1. Project name:
> 2. App URL (the URL audited in the Browser Audit, or leave blank):

Wait for their response. Then proceed with the full workflow below without any further pauses or questions.

---

## CRITICAL: Run to completion without stopping
Complete the entire metrics generation in a single continuous run.
Do NOT pause, ask questions, or wait for user input at any point after receiving metadata.

## Workflow

### Step 1 — Prepare workspace and auto-derive metadata
1. \`set-audit-workspace\` with \`templateName: "metrics"\` — creates \`.ui-audit/\` and copies the metrics template.
2. \`download-template\` with \`templateName: "metrics"\` — seeds a fresh metrics file.
3. Auto-derive the remaining metadata fields using \`run-local-audit\`:
   - \`metadata.commitId\` → run \`git rev-parse --short HEAD\`; use the stdout value. If git is unavailable, use "".
   - \`metadata.repoUrl\` → run \`git remote get-url origin\`; use the stdout value. If no remote, use "".
   - \`metadata.agentVersion\` → hardcoded: "1.0.0" (the MCP server version).
   - \`metadata.auditTimestamp\` → current ISO 8601 timestamp (set at time of metrics generation).
   - \`metadata.projectName\`, \`metadata.appUrl\` → from user answers in Step 0.

### Step 2 — Load audit results
4. \`read-full-checklist\` with \`templateName: "code-audit"\` — load all Code Audit rows.
5. \`read-full-checklist\` with \`templateName: "browser-audit"\` — load all Browser Audit rows.

### Step 3 — Compute metrics
Analyse all rows from both audits and compute every metric value using the rules below.
Use each row's \`Group\`, \`Sub-Group\`, \`Audit Type\`, \`Importance\`, \`Mandatory\`, \`Implemented? (Yes / No)\`, \`Comments\`, and \`Evidence\` columns.

**Summary counts** (nested keys; legacy flat keys like \`summary.codeAuditTotal\` remain supported by the dashboard)
- \`summary.browserAudit.total\`, \`summary.browserAudit.passed\`, \`summary.browserAudit.failed\`, \`summary.browserAudit.notApplicable\` — browser-audit checklist only.
- \`summary.codeAudit.total\`, \`summary.codeAudit.passed\`, \`summary.codeAudit.failed\`, \`summary.codeAudit.notApplicable\` — code-audit checklist only.
- \`summary.manualAudit.total\`, \`summary.manualAudit.passed\`, \`summary.manualAudit.failed\`, \`summary.manualAudit.notApplicable\` — manual-audit checklist only (if applicable).
- \`summary.overall.total\` = sum of audit-type totals; \`summary.overall.passed / failed / notApplicable\` = combined across audits.
- \`summary.overall.mandatoryFailed\` = No rows where \`Mandatory\` is "Yes"; \`summary.overall.criticalFailed / highFailed / mediumFailed\` = No rows by Importance.
- Legacy flat keys still work: \`summary.totalChecks\`, \`summary.passed\`, \`summary.failed\`, \`summary.notApplicable\`, \`summary.mandatoryFailed\`, \`summary.criticalFailed\`, \`summary.highFailed\`, \`summary.mediumFailed\`.

**Domain scores (0–100)**
- Score for each domain = (Yes rows in that domain / total rows in that domain) × 100, rounded to 1 decimal. Omit rows with empty \`Implemented\`.
- Domain groupings by checklist \`Group\` field:
  - \`domains.html\` → Groups: "HTML Semantics & Structure", "HTML Forms & Inputs", "HTML Media & Data", "HTML Metadata & Validation" (both audits)
  - \`domains.css\` → Groups: "CSS Architecture & Tokens", "Layout & Responsiveness", "Performance & Misc - CSS" (code audit)
  - \`domains.javascript\` → Groups: "JavaScript Architecture & Loading", "JavaScript DOM & Performance Safety", "JavaScript State & Reliability", "JavaScript Code Structure & Hygiene" (both audits)
  - \`domains.accessibility\` → Phase: "Accessibility" (both audits)
  - \`domains.performance\` → Phase: "Performance" (browser audit) + Group "Performance & Misc - CSS" (code audit)
  - \`domains.security\` → Phase: "Security" (both audits)
  - \`domains.codeQuality\` → Groups: "Code Quality - Hygiene & Safety", "Code Quality - Structure & Readability", "Code Quality - Errors & Reliability", "Code Quality - Architecture & Dependencies" (code audit)
  - \`domains.processGovernance\` → Phase: "Process & Governance" (code audit)
- Sub-domain scores (e.g. \`domains.html.semanticsScore\`) = same formula filtered to that Sub-Group.

**Domain-specific failure counts**
Count "No" rows matching the relevant Group + Sub-Group + checklist item keyword:
- HTML: headingHierarchyViolations → Sub-Group "Semantics" items about heading hierarchy; multipleH1 → "Single h1" item; missingLabels → "All inputs have associated labels"; placeholderAsLabel → "Placeholder not used as label"; missingErrorAssociation → "Error messages programmatically associated"; missingAccessibleNames → "Accessible names for interactive elements"; missingAltText → Images Sub-Group failures; duplicateIds → "No duplicate IDs"; invalidNesting → "No invalid HTML nesting"; validationErrors → "HTML validates without errors"; ariaMisuse → ARIA Sub-Group failures; brokenLinks → "No broken links"; missingTitle → "Page <title> exists"; missingMetaViewport → "Meta viewport configured correctly"; missingCanonical → "Canonical URL" item; missingCharset → "Charset meta tag" item; missingLangAttribute → "Language attribute (lang)" item; missingMetaDescription → "Meta description tag present" item (browser audit).
- CSS: hardcodedColors → "No hardcoded hex/rgb color values"; hardcodedSpacing → "No hardcoded pixel spacing"; hardcodedFonts → "Font-family declarations" item; inlineStylesCount → "Avoid inline styles"; duplicateRules → "No duplicated CSS rules"; unusedSelectors → "No unused CSS selectors"; designTokensFailed → count of No rows in Sub-Group "Design Tokens" (CSS variables for colors/spacing/typography + no hardcoded values items); responsiveBreakpointIssues → Responsive Sub-Group failures; layoutShiftRisks → Layout Stability (browser audit Stability sub-group); zIndexIssues → "Avoid z-index escalation"; compatibilityIssues → Compatibility Sub-Group failures; qualityIssues → Quality Sub-Group failures.
- JavaScript: blockingScripts → "No blocking scripts in head"; scriptsWithoutAsyncDefer → "Use async or defer"; thirdPartyScriptsNotLazyLoaded → "Third-party scripts lazy loaded"; unusedModulesLoaded → "No JS files loaded on pages where their exports are unused"; memoryLeakRisks → "Avoid memory leaks"; forcedSyncLayouts → "Avoid forced synchronous layouts"; timerLeaks → "All setTimeout/setInterval calls have corresponding clear calls"; pollingWithoutObserver → "setInterval for DOM/state checks flagged"; stateMutationInLoops → "No setState/dispatch/state-mutation calls inside loops"; unusedPackages → "No unused npm/yarn packages"; globalVariables → "No global variables"; deeplyNestedCallbacks → "Avoid deeply nested callbacks".
- Accessibility: wcagViolations — split by Importance of failed WCAG Core rows (Critical/High/Medium); lighthouseScore → extract a numeric score from the Comments/Evidence field of the "Lighthouse accessibility score >= 90" checklist item if the auditor recorded it, else ""; skipLinksPresent → 1 or 0 for "Skip links implemented" (browser audit); focusStylesMissing → 0 or 1 for "Visible focus styles present" (1 = failed); hoverWithoutFocusRules → ":hover rules have corresponding :focus" item; visuallyHiddenPatternIssues → "Visually-hidden patterns" item; dynamicContentAnnounced → "Announce dynamic content changes"; modalDialogIssues → "Modal/dialog elements" item; videoCaptionsMissing → "<video> elements have <track kind=captions>"; audioTranscriptMissing → "<audio> elements have adjacent transcript"; focusTrapMisuse → "No focus-trap calls outside of modal".
- Performance: all \`*Passed\` fields = 1 (Yes) or 0 (No) for the single checklist item: lcpPassed → "LCP < 2.5s" item; clsPassed → "CLS < 0.1" item; inpPassed → "INP < 200ms" item; ttfbPassed → "TTFB < 800ms" item; fcpPassed → "FCP < 1.8s" item; tbtPassed → "No JavaScript long tasks" item; totalPageWeightPassed → "Total page weight within performance budget"; compressionEnabled → "Text resources served with gzip or Brotli"; http2Enabled → "Resources served over HTTP/2 or HTTP/3"; unusedJsCssPercent → extract a numeric value from the Comments field of the Coverage checklist item if the auditor recorded one (e.g. "45% unused"), else ""; imageOptimizationIssues → count of No rows for image optimization items; duplicateNetworkRequests → "No duplicate network requests"; renderBlockingResources → "No render-blocking resources"; webfontFormatOptimal → "Webfont files use WOFF2"; longTasksOnMainThread → "No JavaScript long tasks" item; lighthouseScore → extract a numeric score from the Comments/Evidence field of the "Lighthouse performance score >= 90" checklist item if the auditor recorded it (e.g. "Score: 87"), else ""; seoAndBestPracticesPassed → 1 or 0 for the single combined item "Lighthouse SEO score >= 90 and Best Practices score >= 90".
- Security: evalUsage → "No eval() or Function(string)"; documentWriteUsage → "No document.write"; unsafeInnerHtml → "No unsanitized user input in innerHTML"; inlineScriptsWithoutNonce → "No inline scripts without nonce/hash"; missingCsp → "Content-Security-Policy response header present" (browser); missingSecurityHeaders → "X-Content-Type-Options" item; mixedContent → "No mixed content warnings"; tlsCertificateIssues → "TLS certificate valid"; websocketUnencrypted → "WebSocket connections use wss://"; cspViolations → "No resources loaded from origins not listed in CSP"; jsErrors → "Zero JavaScript errors" browser item; hardcodedSecrets → "No hardcoded API keys"; credentialsInUrls → "No credentials or tokens in URLs"; sensitiveDataInComments → "No sensitive data in client-side comments"; insecureStorage → "No insecure storage usage"; piiInStorage → "No PII stored in cookies"; cookieFlagsIssues → "Cookies used for session management have SameSite" item; vulnerableDependencies → "No known vulnerable dependencies"; formActionHttps → "Form actions use HTTPS only"; sensitiveDataInAttributes → "No sensitive data exposed in client-visible IDs or data attributes".
- Code Quality: lintErrors → "Zero lint errors"; unusedVariables → "No unused variables"; unusedFunctions → "No unused functions"; unusedImports → "No unused imports"; deadCodePaths → "No dead code paths"; deadCodeFiles → "No dead code files"; commentedOutCode → "No commented-out production code"; implicitGlobals → "No implicit globals"; duplicateConstants → "No duplicated constants"; namingConventionViolations → "Variable names" and "Function names" items; complexConditions → "No nested ternary" and "No if/else chains" items; deeplyNestedFunctions → "Functions with if-block wrapping" item; oversizedFilesOrFunctions → "Average file size under 500 LOC" item; duplicateCodePercent → "Duplicate code percentage" item (extract % from Comments if available); circularDependencies → "Avoid circular dependencies"; staleTodoFixme → "No stale TODO/FIXME" items; hardcodedEnvValues → "No hardcoded environment values"; missingReadme → "README present"; inconsistentErrorHandling → "Consistent error handling strategy"; magicNumbers → "Avoid magic numbers"; rawStringThrows → "no raw string throws" (from error message item).
- Process & Governance: gitInitialized → "Git repository initialized" item; gitignorePresent → ".gitignore file present" item; lockfileCommitted → "Package lock file committed" item; preCommitHooksConfigured → "Pre-commit hooks configured" item; nodeVersionSpecified → "Node.js version specified" item; mockDataInProduction → "Hardcoded mock data or example values" item.

**Risk index** — per domain:
- "High" if domain score < 60, "Medium" if 60–79, "Low" if ≥ 80. Use "" if no rows exist for that domain.

**Overall status**
- \`status.ragRating\` (preferred) or \`overallStatus.ragRating\` = "Red" if overall score < 60, "Amber" if 60–79, "Green" if ≥ 80 (use \`scores.overall\` or \`overallScores.uiQualityScore\`).
- \`status.mandatoryPassRate\` or \`overallStatus.mandatoryPassRate\` = (mandatory rows that passed / total mandatory rows) × 100, rounded to 1 decimal.
- \`status.criticalPassRate\` or \`overallStatus.criticalPassRate\` = same formula for Critical importance rows.

**Overall scores** (prefer \`scores.*\`; legacy \`overallScores.*\` still supported)
- \`scores.overall\` = weighted average: accessibility 20%, performance 20%, codeQuality 20%, security 15%, html 10%, javascript 10%, processGovernance 5% (align pillar keys with \`scores.htmlImplementation\`, \`scores.cssImplementation\`, \`scores.javascriptImplementation\`, etc.).
- \`overallScores.uiQualityScore\` may mirror \`scores.overall\` for backward compatibility.
- Other \`scores.*\` pillar keys = corresponding domain scores (0–100).

**Trend snapshot** — set to current computed values (no prior run available):
- Prefer \`trend.*\` (e.g. \`trend.totalIssues\`, \`trend.criticalIssues\`, \`trend.overallScore\`) or copy legacy \`trendSnapshot.*\` / \`overallScores\` as needed.

**Top issues** — up to 10
- Select failed ("No") rows sorted by: Importance (Critical first → High → Medium) then Mandatory (Yes before No).
- Fill \`topIssues.1\` through \`topIssues.10\` with: auditType (Code Audit / Browser Audit), severity (Importance value), mandatory, group, subGroup, description (Checklist Item text, truncated to 200 chars), evidence (Evidence column value; first comma-separated path is shown in Location). Optional: \`id\` or \`code\` (issue id, e.g. DEV-SEMANTIC-DIV), \`line\` (source line; Location shows “Line {n}”), \`phase\` (category badge, e.g. Development / Accessibility).
- Set \`topIssues.count\` = actual number of top issues written (max 10).

**Components requiring attention** — up to 5
- Parse the Evidence column of all failed rows. Extract file/component paths (workspace-relative paths or filenames).
- Group by path, count failed checks and critical failures per path.
- Compute healthScore = 100 − (failedChecks / totalChecksForThatComponent × 100), rounded.
- Sort by failedChecks descending. Write top 5 into \`componentsRequiringAttention.1–5\`.
- Set \`componentsRequiringAttention.count\` = actual number written.
- Leave empty string ("") if no evidence paths are present.

**Metadata**
- Set \`metadata.auditTimestamp\` = current ISO 8601 timestamp.
- Set all other metadata fields from the user's answers in Step 1.

### Step 4 — Write metrics
6. \`write-metrics\` with the full computed key-value object — writes all values to the metrics CSV at once.

### Step 5 — Show audit dashboard
7. Immediately call **\`display-audit-dashboard\`** with \`metricsJson\` set to \`JSON.stringify(...)\` of the **same** flat key-value object you passed to \`write-metrics\` (all EDS-style keys). Omit \`metricsJson\` only if you intend the sample dashboard.
   This opens the Audit Dashboard MCP App (\`ui://ui-audit/audit-dashboard.html\`). Ensure the host **opens or focuses** \`_meta.ui.resourceUri\` from the tool response so the user sees the live dashboard.

### Step 6 — Cleanup
8. Call \`cleanup-workspace\` — removes any auto-generated JSON, MD, and Python files from the workspace, keeping only CSVs.

### Step 7 — Report
9. Print a concise summary table: RAG rating, uiQualityScore, domain scores, criticalFailed count, mandatoryFailed count, and the path to the generated metrics file.

## Rules
- Use ONLY \`read-full-checklist\` to read audit data — do NOT call \`read-checklist-row\` one row at a time.
- Leave a metric value as empty string ("") if it cannot be derived from the audit data — do NOT guess or fabricate values.
- **Always** call \`display-audit-dashboard\` with \`metricsJson: JSON.stringify(metrics)\` after a successful \`write-metrics\` (before \`cleanup-workspace\`) so the dashboard displays the metrics you just generated.
- Never stop mid-generation.`,
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
  'start-metrics-generation',
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
> 4. Path to filled Code Audit CSV (or leave blank to auto-detect from .ui-audit/):
> 5. Path to filled Browser Audit CSV (or leave blank to auto-detect from .ui-audit/):
> 6. Path to filled Manual Checklist CSV (or leave blank to auto-detect from .ui-audit/):

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
    const base = projectPath || getProjectRootForWorkspace();
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
      workspacePath: z.string().optional().describe('Absolute path to directory containing filled checklist CSVs. Defaults to .ui-audit/ workspace.'),
      codeAuditPath: z.string().optional().describe('Absolute path to a filled Code Audit CSV. Overrides workspace lookup for code-audit.'),
      browserAuditPath: z.string().optional().describe('Absolute path to a filled Browser Audit CSV. Overrides workspace lookup for browser-audit.'),
      manualAuditPath: z.string().optional().describe('Absolute path to a filled Manual Checklist CSV. Overrides workspace lookup for manual-audit.'),
    },
  },
  async ({ projectName, appUrl, repoUrl, auditorName, auditDate, workspacePath, codeAuditPath, browserAuditPath, manualAuditPath }) => {
    const { parse: csvParse } = await import('csv-parse/sync');
    const warnings = [];
    const baseDir = workspacePath || config.workspaceDir;

    const loadCsv = async (filePath) => {
      const content = await readFile(filePath, 'utf-8');
      // Strip UTF-8 BOM (\uFEFF) — common in CSVs exported from Excel/Sheets
      const clean = content.replace(/^\uFEFF/, '');
      return csvParse(clean, { columns: true, skip_empty_lines: true, bom: true });
    };

    const loadChecklist = async (templateName, explicitPath) => {
      // If an explicit path is provided, use it directly
      if (explicitPath) {
        try {
          const rows = await loadCsv(explicitPath);
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
