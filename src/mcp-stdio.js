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
import esbuild from 'esbuild';
import config from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const defaultAuditMetrics = JSON.parse(
  readFileSync(resolve(__dirname, 'default-audit-metrics.json'), 'utf8')
);
const PRODUCT_AUDIT_DASHBOARD_URI = 'ui://ui-audit/audit-dashboard.html';
const HTML2PDF_VENDOR_URI = 'ui://ui-audit/vendor/html2pdf.bundle.min.js';
const html2pdfVendorPath = resolve(__dirname, 'progen-craft', 'design-system', 'utils', 'html2pdf.bundle.min.js');
const auditDashboardHtmlPath = resolve(__dirname, 'app-ui', 'audit-dashboard.html');
const auditDashboardCssPath = resolve(__dirname, 'app-ui', 'audit-dashboard.css');
const auditDashboardMcpEntryPath = resolve(__dirname, 'app-ui', 'audit-dashboard-mcp-entry.js');
const designSystemCssDir = resolve(__dirname, 'progen-craft', 'design-system', 'css');
const designSystemCssFragments = [
  'ds-tokens.css',
  'ds-primitives-row.css',
  'ds-layouts-metric-category.css',
  'ds-components-donut-seg.css',
  'ds-components-mini-donut.css',
  'ds-components-stacked-bar.css',
  'ds-components-score-tier.css',
  'ds-motion-preference.css',
  'ds-components-pdf-download.css',
  'ds-components-issues-table.css',
  'ds-components-scores-bar-chart.css',
];

async function readBundledDesignSystemCss() {
  const parts = await Promise.all(
    designSystemCssFragments.map((name) => readFile(resolve(designSystemCssDir, name), 'utf-8'))
  );
  return parts.join('\n');
}

async function buildAuditDashboardContents(uri, variables) {
  let html = await readFile(auditDashboardHtmlPath, 'utf-8');
  const [css, bundleResult, dsCss] = await Promise.all([
    readFile(auditDashboardCssPath, 'utf-8'),
    esbuild.build({
      entryPoints: [auditDashboardMcpEntryPath],
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'esm',
    }),
    readBundledDesignSystemCss(),
  ]);
  const bundledJs = bundleResult.outputFiles[0].text;
  html = html.replace(
    /<link\s+rel=["']stylesheet["']\s+href=["']\.\.\/progen-craft\/design-system\/progen-craft-design-system\.css["']\s*\/?>\s*<link\s+rel=["']stylesheet["']\s+href=["']audit-dashboard\.css["']\s*\/?>/i,
    `<style>\n${dsCss.trimEnd()}\n${css.trimEnd()}\n</style>`
  );
  html = html.replace(
    /<script\s+type=["']module["']\s+src=["']audit-dashboard-entry\.js["']\s*><\/script>/i,
    `<script type="module">\n${bundledJs.trimEnd()}\n</script>`
  );
  const raw = variables?.data ?? uri.searchParams.get('data');
  let tailScripts = '';
  if (raw) {
    try {
      const parsed = JSON.parse(decodeURIComponent(raw));
      const safe = JSON.stringify(parsed).replace(/</g, '\\u003c');
      tailScripts = `<script>window.__PRODUCT_AUDIT_DASHBOARD__=${safe};</script>`;
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
  'Product Audit Dashboard',
  PRODUCT_AUDIT_DASHBOARD_URI,
  {
    description:
      'Interactive MCP App view for product UI audit results: checklist summary, total compliance score, domain donut chart, and drill-down domain rows.',
  },
  async (uri) => buildAuditDashboardContents(uri, undefined)
);

server.registerResource(
  'Product Audit Dashboard (parameterized)',
  new ResourceTemplate(`${PRODUCT_AUDIT_DASHBOARD_URI}{?data}`, {}),
  {
    description:
      'Same product audit dashboard HTML with URL-encoded JSON in the data query param (tool-driven payload).',
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
7. Immediately call **\`show-audit-dashboard\`** with:
   - \`metrics\`: the **same** flat key-value object you passed to \`write-metrics\` (all EDS-style keys).
   - \`projectName\`: from \`metadata.projectName\` in that object, or the user’s project name from Step 0.
   - \`locale\`: only if the user requested a specific dashboard language.
   This opens the Product Audit Dashboard MCP App (\`ui://ui-audit/audit-dashboard.html\`). Ensure the host **opens or focuses** \`_meta.ui.resourceUri\` from the tool response so the user sees the live dashboard.

### Step 6 — Cleanup
8. Call \`cleanup-workspace\` — removes any auto-generated JSON, MD, and Python files from the workspace, keeping only CSVs.

### Step 7 — Report
9. Print a concise summary table: RAG rating, uiQualityScore, domain scores, criticalFailed count, mandatoryFailed count, and the path to the generated metrics file.

## Rules
- Use ONLY \`read-full-checklist\` to read audit data — do NOT call \`read-checklist-row\` one row at a time.
- Leave a metric value as empty string ("") if it cannot be derived from the audit data — do NOT guess or fabricate values.
- **Always** call \`show-audit-dashboard\` after a successful \`write-metrics\` (before \`cleanup-workspace\`) so the dashboard displays the metrics you just generated.
- Never stop mid-generation.`,
      },
    }],
  })
);

server.registerPrompt(
  'show-audit-dashboard',
  {
    description:
      'Open the Product Audit Dashboard MCP App (interactive UI). Invokes the show-audit-dashboard tool so the host can render ui://ui-audit/audit-dashboard.html.',
  },
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Open the **Product Audit Dashboard** in the MCP App UI.

## What to do
1. Call the MCP tool **\`show-audit-dashboard\`** now.
2. Use **no arguments** (or an empty object \`{}\`) to load the built-in sample metrics from the server defaults.
3. If the user asked for a specific project or data, pass a matching payload:
   - \`projectName\`, \`locale\`
   - \`metrics\`: flat key-value object (EDS-style keys such as \`metadata.projectName\`, \`summary.*\`, \`overallScores.*\`, \`overallStatus.*\`)
   - optional \`domains\`, \`auditBanner\`, \`checklistSummaryLine\`, \`totalComplianceValue\`, \`overviewCenterPercent\`, \`checklistSummaryMetrics\`, \`passRates\`

## After the tool returns
- The tool response includes MCP App metadata (\`_meta.ui.resourceUri\`) pointing at \`ui://ui-audit/audit-dashboard.html\` (with \`?data=...\` when the JSON is small enough).
- Ensure the host **opens or focuses** that MCP App / UI resource so the user sees the dashboard.
- Summarize in one short line what is shown (project name, RAG if present, checklist totals if present).

Do not ask follow-up questions unless the user’s request was ambiguous about which metrics to show.`,
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

Wait for their response. Then proceed with the full workflow below without any further pauses or questions.

---

## CRITICAL: Run to completion without stopping
Complete the entire metrics generation in a single continuous run.
Do NOT pause, ask questions, or wait for user input at any point after receiving metadata.

## Workflow

### Step 1 — Prepare workspace and auto-derive metadata
1. \`set-audit-workspace\` with \`templateName: "metrics"\` — creates \`.ui-audit/\` and copies the metrics template.
2. \`download-template\` with \`templateName: "metrics"\` — seeds a fresh metrics file.
3. Auto-derive remaining metadata using \`run-local-audit\`:
   - \`metadata.repoUrl\` → run \`git remote get-url origin\`; use stdout. If unavailable, use "".
   - \`metadata.auditDate\` → current ISO 8601 date string.
   - \`metadata.auditVersion\` → hardcoded: "2.0.0".
   - \`metadata.projectName\`, \`metadata.appUrl\`, \`metadata.auditorName\` → from user answers.

### Step 2 — Load all three audit sources
4. \`read-full-checklist\` with \`templateName: "code-audit"\` — load all Code Audit rows.
5. \`read-full-checklist\` with \`templateName: "browser-audit"\` — load all Browser Audit rows.
6. \`read-full-checklist\` with \`templateName: "manual-audit"\` — load all Manual Checklist rows.

If any checklist file is not found, continue with the available sources and leave the corresponding metric keys as "".

### Step 3 — Compute metrics

#### Summary counts
- \`summary.codeAudit.total / passed / failed / notApplicable\` — Code Audit rows only. passed = "Yes" rows, failed = "No" rows, notApplicable = empty \`Implemented?\` rows.
- \`summary.browserAudit.total / passed / failed / notApplicable\` — Browser Audit rows only.
- \`summary.manualAudit.total / passed / failed / notApplicable\` — Manual Checklist rows only. Count "Yes" as passed, "No" as failed, empty as notApplicable.
- \`summary.overall.total / passed / failed / notApplicable\` — all three combined.
- \`summary.overall.mandatoryFailed\` = "No" rows across all audits where \`Mandatory\` = "Yes".
- \`summary.overall.criticalFailed\` = "No" rows where \`Importance\` = "Critical".
- \`summary.overall.highFailed\` = "No" rows where \`Importance\` = "High".
- \`summary.overall.mediumFailed\` = "No" rows where \`Importance\` = "Medium".

#### Domain scores (0–100)
Score = (passed rows in domain / total answered rows in domain) × 100, rounded to 1 decimal. Omit rows with empty \`Implemented?\`.

**Domain scores** — one score per category, combining rows from all applicable audits:
- \`scores.discovery\` → Manual Checklist Phase = "Discovery"
- \`scores.contentQuality\` → Manual Checklist Phase = "Content Quality"
- \`scores.internationalization\` → Manual Checklist Phase = "Internationalization"
- \`scores.design\` → Manual Checklist Phase = "Design"
- \`scores.userExperience\` → Manual Checklist Phase = "User Experience"
- \`scores.visualDesign\` → Manual Checklist Phase = "Visual Design"
- \`scores.setup\` → Manual Checklist Phase = "Setup"
- \`scores.development\` → Code Audit groups: HTML Semantics & Structure, HTML Forms & Inputs, HTML Media & Data, HTML Metadata & Validation, CSS Architecture & Tokens, Layout & Responsiveness, Performance & Misc - CSS, JavaScript Architecture & Loading, JavaScript DOM & Performance Safety, JavaScript State & Reliability, JavaScript Code Structure & Hygiene, Code Quality - Hygiene & Safety, Code Quality - Structure & Readability, Code Quality - Errors & Reliability, Code Quality - Architecture & Dependencies; AND Browser Audit Phase = "Development".
- \`scores.architectureReview\` → Manual Checklist Phase = "Architecture & Code Review"
- \`scores.testing\` → Manual Checklist Phase = "Testing"
- \`scores.security\` → Security phase/groups across all three audits.
- \`scores.performance\` → Performance phase/groups across all three audits.
- \`scores.accessibility\` → Accessibility phase/groups across all three audits.
- \`scores.authorValidation\` → Manual Checklist Phase = "Author Validation"
- \`scores.preGoLive\` → Manual Checklist Phase = "Pre-GoLive"
- \`scores.postGoLive\` → Manual Checklist Phase = "Post-GoLive"
- \`scores.processGovernance\` → Code Audit groups: Version Control & Repository, Testing & Quality Gates, Project Configuration, GenAI Tools & Code Quality; AND Manual Checklist Phase = "Process & Governance".

#### Overall score
- \`scores.overall\` = weighted average:
  - accessibility 15%, performance 15%, security 15%, development 15%, processGovernance 5%, testing 5%, discovery 3%, design 3%, setup 3%, contentQuality 3%, userExperience 3%, visualDesign 3%, preGoLive 3%, postGoLive 3%, authorValidation 2%, architectureReview 2%, internationalization 2%.
  - Skip any domain with no answered rows (exclude from weight total and renormalise).

#### Manual per-item metrics
For each \`manual.*\` key in the metrics template, find the corresponding Manual Checklist row by matching Phase + Sub-Group + item intent. Set value to:
- "1" if \`Implemented?\` = "Yes"
- "0" if \`Implemented?\` = "No"
- "" if empty

Mappings by key prefix → Phase → Sub-Group:
- \`manual.discovery.*\` → Phase "Discovery" rows in order: businessObjectivesAndKpisDefined, targetAudienceAndPersonasDefined, cdnProviderAndRepoIdentified, edsAuthoringAndContentRequirementsDefined, edsBlockRequirementsAndStructureDefined, integrationAndMarTechRequirementsDefined, nonFunctionalRequirementsDefined, seoRoutingAndLocalizationDefined.
- \`manual.design.*\` → Phase "Design": hldDocumented, blockAndFragmentDesignComplete, performanceByDesignGoalsDefined, responsiveAndAccessibilityStrategyDefined, seoAndErrorStrategyDesigned.
- \`manual.setup.*\` → Phase "Setup": cdnConfigured, repoAndContentSourceConfigured, aemSidekickInstalledAndConfigured, ciCdPipelineConfigured, devStagingProdEnvironmentsSetUp, prProcessAndBranchingStrategyDefined, i18nAndTranslationSetup.
- \`manual.visualDesign.*\` → Phase "Visual Design": uiMatchesDesignMockupsAtAllViewports, brandingAndInteractiveStatesConsistent.
- \`manual.userExperience.*\` → Phase "User Experience": coreUserFlowsIntuitive, loadingEmptyErrorStatesPresent, formValidationUxVerified.
- \`manual.contentQuality.*\` → Phase "Content Quality": copySpellingGrammarLegalTextVerified, cookieConsentMeetsGdprCcpa.
- \`manual.testing.*\` → Phase "Testing": contentPreviewAndPublishWorkflowValidated, functionalAndE2ETestingComplete, unitTestsAutomatedInCiCd, rumSetUpAndConfigured, crossBrowserAndDeviceTestingComplete.
- \`manual.security.*\` → Phase "Security": apiEndpointsSecured, rbacImplemented, dataEncryptionAndGdprCompliant, secretsManagementAndPenTestingDone.
- \`manual.authorValidation.*\` → Phase "Author Validation": authorTrainingAndSidekickVerified, authorWorkflowValidatedInDocsSheets, blockUsabilityReviewComplete, documentToWebRenderingValidated.
- \`manual.performance.*\` → Phase "Performance": cdnCachingStrategyValidated, rumMonitoringAndAlertsConfigured, aboveTheFoldLoadsWithin2500ms.
- \`manual.accessibility.*\` → Phase "Accessibility": screenReaderTestingComplete, keyboardOnlyNavigationTested, axeWaveToolsRunAndRemediated.
- \`manual.i18n.*\` → Phase "Internationalization": rtlLayoutVerified, textExpansionDoesNotBreakLayout, localeFormattingCorrect.
- \`manual.architectureReview.*\` → Phase "Architecture & Code Review": designTokensMatchFigma, webfontStrategyReviewed.
- \`manual.preGoLive.*\` → Phase "Pre-GoLive": cdnCachingAndDnsFinalized, deploymentAndRollbackPlanCreated, previewAndLiveDomainValidated, finalE2eSmokeLoadTestingComplete, seoLaunchReadinessVerified.
- \`manual.postGoLive.*\` → Phase "Post-GoLive": centralizedLoggingAndAlertsConfigured, cwvRumCdnMonitoringSetup, authorSupportAndHelpdeskEstablished, incidentResponseAndSlasDefined, seoIndexingAndAnalyticsMonitored, continuousImprovementPlanInPlace.
- \`manual.governance.*\` → Phase "Process & Governance": projectManagementToolActivelyUsed, codeReviewProcessWithSlaDefined, qaEnvironmentMirrorsProduction, genAiGovernancePolicyDocumented.

#### Granular detail fields
After computing all scores and summaries, populate every \`browser.*\` and \`code.*\` key by scanning the loaded audit rows.

**Value rules (apply to all granular fields):**
- **Pass/fail fields** (no numeric suffix): 1 if \`Implemented?\` = "Yes", 0 if "No", "" if empty.
- **Count fields** (key contains "Count" or implies a count of violations): extract integer from Comments/Evidence. Use 0 if the item passed ("Yes") and no count is recorded. Use "" if empty.
- **Measurement fields** (Ms, Kb, Score, Percent): extract the numeric value from Comments/Evidence. Use "" if not found.
- **Inverted negative fields** (field name implies "detected" or "has issue"): still apply 1=Yes / 0=No. For example, \`mixedContentDetected\` = 0 when the row says "Yes" (meaning no mixed content detected = pass).

**browser.accessibility** (Browser Audit rows):
- \`skipLinksImplemented\` → item "Skip links implemented"
- \`lighthouseAccessibilityScore\` → item "Lighthouse accessibility score >= 90" → extract score number
- \`wcagViolationsCritical\` → same item → extract critical violation count (0 if Yes)
- \`wcagViolationsTotal\` → same item → extract total violation count (0 if Yes)

**browser.security** (Browser Audit rows):
- \`inlineScriptsWithoutNonce\` → "No inline scripts without nonce/hash"
- \`formActionsUseHttps\` → "Form actions use HTTPS only"
- \`cspHeaderPresent\` → "Content-Security-Policy (CSP) response header present"
- \`cspHasUnsafeDirectives\` → same row → 0 if Yes (no unsafe directives), 1 if No (has unsafe)
- \`xContentTypeOptionsPresent\` → "X-Content-Type-Options: nosniff present" (same row as X-Frame-Options)
- \`xFrameOptionsOrCspFrameAncestors\` → same row
- \`referrerPolicyPresent\` → same row
- \`zeroJsErrorsInConsole\` → "Zero JavaScript errors or unhandled promise rejections"
- \`noDeprecatedApiWarnings\` → "No deprecated browser API usage warnings"
- \`mixedContentDetected\` → "No mixed content warnings" → 0 if Yes (none), 1 if No (detected)
- \`tlsCertificateValid\` → "TLS certificate valid and not expired"
- \`sensitiveDataInClientStorage\` → "No sensitive data... in Application panel" → 0 if Yes, 1 if No
- \`cookieSameSiteSecureFlags\` → "Cookies used for session management have SameSite"
- \`websocketUsesWss\` → "WebSocket connections use wss://"
- \`noCspViolationsInConsole\` → "No resources loaded from origins not listed in CSP"

**browser.performance** (Browser Audit rows):
- \`lazyLoadingBelowFold\` → "Lazy loading for below-the-fold images"
- \`cssDeliveryOptimized\` → "CSS delivery optimized"
- \`unusedJsRemoved\` → "Unused JS removed"
- \`webfontUsesWoff2\` → "Webfont files use WOFF2"
- \`lighthousePerformanceScore\` → "Lighthouse performance score >= 90" → extract score
- \`lcpMs\` → "LCP < 2.5s; CLS < 0.1; INP < 200ms" → extract LCP value in ms
- \`clsScore\` → same row → extract CLS score
- \`inpMs\` → same row → extract INP value in ms
- \`longTasksOnMainThread\` → "No JavaScript long tasks (> 50ms)" → 0 if Yes (none), 1 if No
- \`tbtWithinBudget\` → same row → 1 if Yes, 0 if No
- \`ttfbMs\` → "Time to First Byte (TTFB) < 800ms" → extract TTFB in ms
- \`lighthouseSeoScore\` → "Lighthouse SEO score >= 90 and Best Practices score >= 90" → extract SEO score
- \`lighthouseBestPracticesScore\` → same row → extract Best Practices score
- \`totalPageWeightKb\` → "Total page weight within performance budget" → extract size in KB
- \`compressionEnabled\` → "Text resources served with gzip or Brotli"
- \`imageOptimizationIssues\` → "All images within size budget" → 0 if Yes, extract count from Comments if No
- \`resourcesOverHttp2OrHttp3\` → "Resources served over HTTP/2 or HTTP/3"
- \`unusedJsCssPercent\` → "JavaScript and CSS coverage... < 50% unused" → extract percent from Comments
- \`fcpMs\` → "FCP < 1.8s and Speed Index < 3.4s" → extract FCP in ms
- \`speedIndexMs\` → same row → extract Speed Index in ms
- \`duplicateNetworkRequests\` → "No duplicate network requests" → 0 if Yes, extract count if No

**browser.development** (Browser Audit rows):
- \`metaDescriptionPresent\` → "Meta description tag present on all pages"
- \`metaDescriptionLength\` → same row → extract character length from Comments
- \`faviconPresent\` → "Favicon present in head"
- \`canonicalUrlPresent\` → "Canonical URL present on all indexable pages"
- \`hreflangImplemented\` → "Alternate language annotations (hreflang)"
- \`cssBeforeScriptsInHead\` → "CSS link and style tags appear before script tags"
- \`externalLinksHaveNoopener\` → "External links with target=_blank include rel=noopener"
- \`customErrorPagesExist\` → "Custom error pages for 404 and 5xx"
- \`responsiveAtAllBreakpoints\` → "Page layout tested at standard breakpoints"
- \`clsInPerformancePanel\` → "CLS < 0.1 verified in Performance panel"
- \`noRenderBlockingResources\` → "No render-blocking resources identified"
- \`noConsoleLogInProduction\` → "No console.log or developer debug output"
- \`noViolationMessagesInConsole\` → "No Violation messages in Console panel"
- \`noForcedSyncLayoutsInFlameChart\` → "No forced synchronous layouts (layout thrashing)"
- \`noExcessiveRepaintsOnScroll\` → "No excessive repaints on scroll"
- \`noDetachedDomNodes\` → "No detached DOM nodes"
- \`preloadedResourcesConsumed\` → "Preloaded resources are consumed within the page load"
- \`webFontsLoadWithoutFoit\` → "Web fonts load without FOIT"

**code.html.semantics** (Code Audit rows):
- \`semanticToDivRatioPass\` → "Semantic-to-div ratio above threshold"
- \`headingHierarchyCorrect\` → "Correct heading hierarchy maintained"
- \`singleH1PerPage\` → "Single h1 per page"

**code.html.structure** (Code Audit rows):
- \`domSourceOrderMatchesTabOrder\` → "DOM source order matches visual tab order"
- \`criticalContentInRawHtml\` → "Page content hierarchy intact"
- \`excessiveDomDepth\` → "Avoid excessive DOM depth" → 0 if Yes (no issue), 1 if No (has issue)

**code.html.forms** (Code Audit rows):
- \`radioCheckboxHaveFieldsetLegend\` → "Radio/checkbox groups wrapped in fieldset with legend"
- \`allInputsHaveLabels\` → "All inputs have associated labels"
- \`missingLabelsCount\` → same row → extract count (0 if Yes)
- \`placeholderUsedAsLabel\` → "Placeholder not used as label" → 0 if Yes (good), 1 if No (bad)
- \`errorMessagesLinkedToInputs\` → "Error messages programmatically associated with inputs"
- \`interactiveElementsHaveAccessibleNames\` → "Accessible names for interactive elements"
- \`inlineStylesCount\` → "Avoid inline styles" → extract count (0 if Yes)

**code.html.media** (Code Audit rows):
- \`decorativeImagesHaveEmptyAlt\` → "Images with role='presentation' or aria-hidden='true' have empty alt"
- \`altTextQualityPass\` → "Alt text is not a filename or path"
- \`missingOrInvalidAltCount\` → same row → extract count (0 if Yes)
- \`tablesHaveTheadTbody\` → "Tables use thead and tbody"
- \`tableHeadersUseTh\` → "Table headers use th"
- \`listsUseUlOrOlCorrectly\` → "Lists use ul or ol correctly"
- \`imgElementsHaveDimensionsForCls\` → "Content img elements have explicit width and height HTML attributes"

**code.html.metadata** (Code Audit rows):
- \`pageTitlePresent\` → "Page title exists; is >10 characters"
- \`pageTitleQualityPass\` → same row
- \`metaViewportConfigured\` → "Meta viewport configured correctly"
- \`charsetDeclaredInHead\` → "Charset meta tag declared in head"
- \`langAttributeValid\` → "Language attribute (lang) on html element is a valid BCP 47 tag"
- \`dirAttributeForRtl\` → "Direction attribute (dir) specified"
- \`duplicateIdsCount\` → "No duplicate IDs" → extract count (0 if Yes)
- \`invalidHtmlNestingCount\` → "No invalid HTML nesting" → extract count (0 if Yes)
- \`htmlValidationErrorCount\` → "HTML validates without errors" → extract count (0 if Yes)
- \`ariaRolesDontDuplicateSemantics\` → "ARIA roles do not duplicate native semantics"
- \`noAriaMisuse\` → "Avoid misuse of ARIA roles"
- \`ariaUsedOnlyWhenNecessary\` → "ARIA used only when necessary"
- \`metaTagsDoNotBlockZoom\` → "Meta tags do not block zoom"
- \`brokenLinksCount\` → "No broken links" → extract count (0 if Yes)

**code.css.tokens** (Code Audit rows):
- \`cssVarsUsedForColors\` → "CSS variables used for all colors"
- \`cssVarsUsedForSpacing\` → "CSS variables used for spacing scale"
- \`cssVarsUsedForTypography\` → "CSS variables used for typography scale"
- \`cssVarsUsedForFontFamily\` → "Font-family declarations defined at :root or body level using CSS variables"
- \`hardcodedHexOrRgbCount\` → "No hardcoded hex/rgb color values" → extract count (0 if Yes)
- \`hardcodedPixelSpacingCount\` → "No hardcoded pixel spacing where tokens exist" → extract count (0 if Yes)

**code.css.maintainability** (Code Audit rows):
- \`namingConventionsConsistent\` → "Consistent naming conventions" (CSS Maintainability sub-group)
- \`classNamesAvoidColorOrPosition\` → "Class names do not contain hex values or color names"
- \`selectorsColocatedInSameFile\` → "CSS selectors for same component co-located in same file"
- \`printStylesheetHidesNonEssential\` → no matching checklist item → leave as ""

**code.css.layout** (Code Audit rows):
- \`modernLayoutUsed\` → "Layout containers use display:flex or display:grid"
- \`mobileFirstMediaQueries\` → "min-width media queries outnumber max-width queries"
- \`standardBreakpointsOnly\` → "Standard breakpoints only"
- \`responsiveImagesByDefault\` → "Responsive images by default"
- \`zIndexEscalationIssues\` → "Avoid z-index escalation" → 0 if Yes (no issues), 1 if No (has issues)

**code.css.performance** (Code Audit rows):
- \`noExpensiveBoxShadows\` → "Avoid expensive box-shadows"
- \`noHeavyCssFilters\` → "Avoid heavy CSS filters"
- \`noInfiniteAnimationsOnNonLoaders\` → "No infinite CSS animations on non-loading elements"
- \`cssCompatibilityIssuesCount\` → "All CSS properties/values supported in target browsers" → extract count (0 if Yes)
- \`vendorPrefixIssues\` → "Avoid vendor prefixes unless required" → 0 if Yes, 1 if No

**code.css.quality** (Code Audit rows):
- \`duplicateCssRulesCount\` → "No duplicated CSS rules" → extract count (0 if Yes)
- \`unusedCssSelectorsCount\` → "No unused CSS selectors" → extract count (0 if Yes)
- \`propertyOrderingConsistent\` → "Consistent property ordering"

**code.javascript.loading** (Code Audit rows):
- \`noBlockingScriptsInHead\` → "No blocking scripts in head"
- \`asyncOrDeferUsed\` → "Use async or defer appropriately"
- \`thirdPartyScriptsLazyLoaded\` → "Third-party scripts lazy loaded"
- \`noUnusedModulesLoaded\` → "No JS files loaded on pages where their exports are unused"
- \`noMarketingTagsInHead\` → "No marketing tags in head"
- \`userFacingStringsUseI18nKeys\` → "User-facing strings in component render/template functions use i18n keys"
- \`noBinariesInRepo\` → "No binaries stored in repository"
- \`errorMessagesFollowPattern\` → "Error messages follow consistent pattern"

**code.javascript.dom** (Code Audit rows):
- \`noTightDomCoupling\` → "Avoid tight DOM coupling"
- \`noForcedSyncLayoutsInCode\` → "Avoid forced synchronous layouts" (Code Audit)
- \`timerLeaksCount\` → "All setTimeout/setInterval calls have corresponding clear calls" → extract count (0 if Yes)
- \`pollingWithoutObserverCount\` → "setInterval for DOM/state checks flagged" → extract count (0 if Yes)
- \`prefersNativeBrowserApis\` → "Prefer native browser APIs"
- \`modernEs6SyntaxUsed\` → "Modern ES6+ syntax used"

**code.javascript.state** (Code Audit rows):
- \`noMemoryLeakRisks\` → "Avoid memory leaks"
- \`eventListenersCleanedUp\` → "Event listeners cleaned up properly"
- \`asyncAwaitUsed\` → "Async logic uses async/await"
- \`promisesHandledCorrectly\` → "Promises handled correctly"
- \`stateMutationThroughSetters\` → "State changes occur through defined setters/reducers/actions"
- \`noSharedStateMutation\` → "No mutation of shared state"
- \`noSideEffectsInPureFunctions\` → "No side effects in pure functions"
- \`consistentReturnTypes\` → "Consistent return types"
- \`noStateMutationInLoops\` → "No setState/dispatch/state-mutation calls inside for/while loops"

**code.javascript.structure** (Code Audit rows):
- \`globalVariablesCount\` → "No global variables" → extract count (0 if Yes)
- \`jsScopedToComponent\` → "JS scoped to component or block"
- \`codingStyleConsistent\` → "Consistent coding style"
- \`deeplyNestedCallbacksCount\` → "Avoid deeply nested callbacks" → extract count (0 if Yes)
- \`callChainDepthWithinLimit\` → "Call chain depth <= 4 levels"
- \`inputValidationPresent\` → "All external inputs are validated, sanitized, and secured"
- \`noUnreachableCode\` → "No unreachable code"
- \`noEmptyCatchBlocks\` → "No empty catch blocks"
- \`noUnusedNpmPackages\` → "No unused npm/yarn packages"
- \`noUnusedComponentProps\` → "No unused component props"

**code.accessibility.wcag** (Code Audit rows):
- \`wcag21AAComplianceMet\` → "WCAG 2.1 AA compliance met"
- \`dynamicContentChangesAnnounced\` → "Announce dynamic content changes"

**code.accessibility.components** (Code Audit rows):
- \`modalDialogAriaCorrect\` → "Modal/dialog elements have role='dialog'"
- \`videoCaptionsPresent\` → "video elements have track kind='captions'"
- \`audioTranscriptsPresent\` → "audio elements have adjacent transcript"
- \`noFocusTrapMisuse\` → "No focus-trap calls outside of modal/dialog components"

**code.accessibility.css** (Code Audit rows):
- \`visibleFocusStylesPresent\` → "Visible focus styles present"
- \`hoverRulesHaveFocusEquivalent\` → "All CSS :hover rules have corresponding :focus"
- \`visuallyHiddenPatternCorrect\` → "Visually-hidden patterns use appropriate CSS"

**code.security.clientCode** (Code Audit rows):
- \`noEvalOrFunctionString\` → "No eval() or Function(string)"
- \`noDocumentWrite\` → "No document.write or document.writeln"
- \`externalScriptsHaveSri\` → "External scripts use Subresource Integrity (SRI)"
- \`noUnsanitizedInnerHtml\` → "No unsanitized user input in innerHTML"

**code.security.secrets** (Code Audit rows):
- \`noHardcodedApiKeys\` → "No hardcoded API keys or secrets in source"
- \`noCredentialsInUrls\` → "No credentials or tokens in URLs or query parameters"
- \`noSensitiveDataInComments\` → "No sensitive data in client-side comments or console logs"
- \`noInsecureStorageForSecrets\` → "No insecure storage usage"
- \`noPiiInStorageWithoutConsent\` → "No PII stored in cookies or browser storage without encryption"

**code.security.dependencies** (Code Audit rows):
- \`noKnownVulnerableDependencies\` → "No known vulnerable dependencies"

**code.security.input** (Code Audit rows):
- \`noSensitiveDataInClientVisibleAttributes\` → "No sensitive data exposed in client-visible IDs or data attributes"

**code.quality.hygiene** (Code Audit rows):
- \`lintErrorsCount\` → "Zero lint errors" → extract count (0 if Yes)
- \`unusedVariablesCount\` → "No unused variables" → extract count (0 if Yes)
- \`unusedFunctionsCount\` → "No unused functions" → extract count (0 if Yes)
- \`unusedImportsCount\` → "No unused imports" → extract count (0 if Yes)
- \`deadCodePathsCount\` → "No dead code paths" → extract count (0 if Yes)
- \`deadCodeFilesCount\` → "No dead code files (unreferenced modules)" → extract count (0 if Yes)
- \`commentedOutCodeCount\` → "No commented-out production code" → extract count (0 if Yes)
- \`implicitGlobalsCount\` → "No implicit globals" → extract count (0 if Yes)
- \`fileStructureConsistent\` → "Consistent file structure"
- \`duplicateConstantsCount\` → "No duplicated constants" → extract count (0 if Yes)

**code.quality.readability** (Code Audit rows):
- \`variableNamingViolationsCount\` → "Variable names >2 characters" → extract count (0 if Yes)
- \`functionNamingViolationsCount\` → "Function names start with verb" → extract count (0 if Yes)
- \`namingConventionsConsistent\` → "Consistent naming conventions" (Code Quality sub-group)
- \`complexConditionsCount\` → "No nested ternary expressions" → extract count (0 if Yes)
- \`missingGuardClausesCount\` → "Functions with if-block wrapping >80% of function body" → extract count (0 if Yes)
- \`oversizedFilesOrFunctionsCount\` → "Average file size under 500 LOC; functions under 40 lines" → extract count (0 if Yes)
- \`singleResponsibilityViolationsCount\` → "Files have single responsibility and clear module boundaries" → extract count (0 if Yes)
- \`readmePresent\` → "README present"

**code.quality.reliability** (Code Audit rows):
- \`inconsistentErrorHandlingCount\` → "Consistent error handling strategy" → extract count (0 if Yes)
- \`poorErrorLoggingCount\` → "Errors logged meaningfully" → extract count (0 if Yes)
- \`ungracefulErrorsCount\` → "Errors fail gracefully" → extract count (0 if Yes)
- \`magicNumbersCount\` → "Avoid magic numbers" → extract count (0 if Yes)
- \`uncentralizedConstantsCount\` → "Constants centralized" → extract count (0 if Yes)
- \`hardcodedBehaviorCount\` → "Config-driven behavior" → extract count (0 if Yes)
- \`duplicatedUtilitiesCount\` → "Shared utilities extracted" → extract count (0 if Yes)
- \`duplicateCodePercent\` → "Duplicate code percentage within standard threshold" → extract percent from Comments (0 if Yes and not recorded)

**code.quality.architecture** (Code Audit rows):
- \`hardcodedEnvValuesCount\` → "No hardcoded environment values" → extract count (0 if Yes)
- \`circularDependenciesCount\` → "Avoid circular dependencies" → extract count (0 if Yes)
- \`staleTodoFixmeCount\` → "No stale TODO/FIXME comments" → extract count (0 if Yes)

**code.governance** (Code Audit rows):
- \`vcs.gitRepositoryInitialized\` → "Git repository initialized"
- \`vcs.gitignorePresent\` → ".gitignore file present"
- \`vcs.lockfileCommitted\` → "Package lock file committed"
- \`quality.preCommitHooksConfigured\` → "Pre-commit hooks configured"
- \`config.nodeVersionSpecified\` → "Node.js version specified via engines field"
- \`genai.noMockDataInProduction\` → "Hardcoded mock data or example values left in production code" → 0 if Yes (has mock data = bad), 1 if No (no mock data = good)

#### Components requiring attention — up to 5
- Parse the Evidence column of all failed ("No") rows from Code Audit and Browser Audit.
- Extract workspace-relative file/component paths or filenames.
- Group by path; count failedChecks and criticalFailures per path.
- Compute healthScore = 100 − (failedChecks / totalChecksForThatPath × 100), rounded to nearest integer.
- Sort by failedChecks descending. Write top 5 into \`components.1\`–\`components.5\`:
  - \`components.N.name\` = filename (basename of path)
  - \`components.N.path\` = workspace-relative path
  - \`components.N.failedChecks\` = count
  - \`components.N.criticalFailures\` = count of Critical-importance failures for this path
  - \`components.N.healthScore\` = computed score
- \`components.count\` = actual number written (max 5). Use "" for each field if no evidence paths are present.

#### Risk index — per domain
- "High" if score < 60, "Medium" if 60–79, "Low" if ≥ 80. Use "" if no answered rows exist.
- Populate one \`risk.*\` key per category, matching the 17 domain scores:
  \`risk.discovery\`, \`risk.contentQuality\`, \`risk.internationalization\`, \`risk.design\`, \`risk.userExperience\`, \`risk.visualDesign\`, \`risk.setup\`, \`risk.development\`, \`risk.architectureReview\`, \`risk.testing\`, \`risk.security\`, \`risk.performance\`, \`risk.accessibility\`, \`risk.authorValidation\`, \`risk.preGoLive\`, \`risk.postGoLive\`, \`risk.processGovernance\`.

#### Overall status
- \`status.ragRating\` = "Red" if scores.overall < 60, "Amber" if 60–79, "Green" if ≥ 80.
- \`status.goLiveReady\` = "Yes" if ragRating is "Green" AND mandatoryFailed = 0 AND criticalFailed = 0, else "No".
- \`status.mandatoryPassRate\` = (mandatory rows passed / total mandatory rows) × 100, rounded to 1 decimal, across all audits.
- \`status.criticalPassRate\` = same for Critical importance rows.
- \`status.highPassRate\` = same for High importance rows.
- \`status.totalBlockingIssues\` = mandatoryFailed + criticalFailed.

#### Trend snapshot
Copy current values: \`trend.totalIssues\` = overall.failed, \`trend.criticalIssues\` = criticalFailed, \`trend.overallCompliance\` = scores.overall, \`trend.accessibilityCompliance\` = scores.accessibility, \`trend.performanceCompliance\` = scores.performance, \`trend.securityCompliance\` = scores.security, \`trend.developmentCompliance\` = scores.development.

#### Top issues — up to 10
- Select all "No" rows from all three audits. Sort by: Importance (Critical → High → Medium) then Mandatory (Yes before No).
- Fill \`topIssues.1\` through \`topIssues.10\`: auditType ("Code Audit" / "Browser Audit" / "Manual"), phase (Phase column value), group (Group column value), subGroup (Sub-Group column value), severity (Importance value), mandatory (Mandatory value), description (Checklist Item text, max 200 chars), evidence (Evidence or Comments column value).
- Set \`topIssues.count\` = actual number written (max 10).

### Step 4 — Write metrics
7. \`write-metrics\` with the full computed key-value object.

### Step 5 — Cleanup
8. \`cleanup-workspace\` — removes any auto-generated JSON, MD, and Python files, keeping only CSVs.

### Step 6 — Report
9. Print a concise summary table: RAG rating, go-live readiness, overall score, all 17 domain scores with their risk ratings, criticalFailed count, mandatoryFailed count, totalBlockingIssues, and the path to the generated metrics file.

## Rules
- Use ONLY \`read-full-checklist\` to load audit data — never \`read-checklist-row\` for analysis.
- For Manual Checklist rows, only "Yes" counts as passed.
- Leave a metric value as "" if it cannot be derived — do NOT guess or fabricate.
- Never stop mid-generation.`,
      },
    }],
  })
);

// ── Tools ──

const drilldownMetricSchema = z.object({
  metric: z.string().describe('Row label in the Metric column.'),
  compliance: z.string().describe('Compliance status text, e.g. Yes, No, Partial.'),
  score: z.union([z.number(), z.string()]).describe('Numeric score 0–100; color: red if under 40, amber 40–89, green 90+.'),
});

const auditDomainRowSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  value: z.union([z.string(), z.number()]),
  passed: z
    .union([z.number(), z.string()])
    .optional()
    .describe('Passed checklist count for this domain (pair with total); shown as passed/total with a progress bar.'),
  total: z
    .union([z.number(), z.string()])
    .optional()
    .describe('Total checklist items for this domain; progress bar uses passed/total. If omitted with passed, defaults are derived from the score value.'),
  domainKey: z
    .string()
    .optional()
    .describe('Stable id for drill-down metrics (slug, e.g. ui-quality). Defaults from title if omitted.'),
  metrics: z
    .array(drilldownMetricSchema)
    .optional()
    .describe('Optional metric rows for the domain drill-down table (Metric, Compliance, Score).'),
  iconBg: z.string().optional(),
  iconSvg: z.string().optional(),
});

const auditBannerInputSchema = z.object({
  titlePrefix: z.string().optional().describe('Title prefix before the em dash (default: UI Audit).'),
  repoUrl: z.string().optional().describe('Repository URL or clone string; monospace line under the title.'),
  appUrl: z.string().optional().describe('Deployed app URL; rendered as a link.'),
  commitId: z.string().optional().describe('Commit id or hash; shown shortened in the Commit · Generated line.'),
  auditTimestamp: z.string().optional().describe('ISO or display timestamp after "Generated".'),
  ragRating: z
    .string()
    .optional()
    .describe('RAG pill: Red, Amber, or Green (case-insensitive).'),
});

const checklistSummaryMetricsInputSchema = z.object({
  totalChecks: z.union([z.number(), z.string()]).optional(),
  passed: z.union([z.number(), z.string()]).optional(),
  failed: z.union([z.number(), z.string()]).optional(),
  notApplicable: z.union([z.number(), z.string()]).optional(),
  criticalFailed: z.union([z.number(), z.string()]).optional(),
  highFailed: z.union([z.number(), z.string()]).optional(),
  mediumFailed: z.union([z.number(), z.string()]).optional(),
  mandatoryFailed: z.union([z.number(), z.string()]).optional(),
});

const passRatesInputSchema = z.object({
  mandatoryPassRate: z.union([z.number(), z.string()]).optional(),
  criticalPassRate: z.union([z.number(), z.string()]).optional(),
});

registerAppTool(
  server,
  'display-audit-dashboard',
  {
    title: 'Audit dashboard',
    description:
      'Opens the Audit MCP App: metadata header, RAG pill, Overall Compliance + donut from scores.* / overallScores, summary mini-donuts (browser / code / manual audit), and category cards from flat metrics keys (prefix = category). Default sample is src/default-audit-metrics.json when metrics is omitted. Override with metrics, optional domains[], locale, etc.',
    inputSchema: {
      projectName: z
        .string()
        .optional()
        .describe('Project or product name shown at the top of the overview and drill-down views.'),
      checklistSummaryLine: z
        .string()
        .optional()
        .describe('Line under the section title, e.g. number of checklist items audited.'),
      totalComplianceValue: z
        .union([z.number(), z.string()])
        .optional()
        .describe('Aggregate compliance figure shown beside the label (default: 81).'),
      overviewCenterPercent: z
        .number()
        .optional()
        .describe('Default donut center percentage before segment hover (default: average of domain scores).'),
      locale: z
        .string()
        .optional()
        .describe('Dashboard UI language (e.g. "en", "es"). Labels and default drill-down copy follow this locale.'),
      domains: z
        .array(auditDomainRowSchema)
        .optional()
        .describe(
          'Audit domain rows: title, subtitle, score value; optional passed/total checklist counts (shown as passed/total with a bar); optional domainKey and metrics for drill-down.'
        ),
      auditBanner: auditBannerInputSchema
        .optional()
        .describe('Banner meta: repoUrl, appUrl, commitId, auditTimestamp, ragRating, optional titlePrefix.'),
      checklistSummaryMetrics: checklistSummaryMetricsInputSchema
        .optional()
        .describe('Counts for the Checklist summary insight card (total, passed, failed, N/A, severity/mandatory failed).'),
      passRates: passRatesInputSchema
        .optional()
        .describe('Mandatory and critical pass rate percentages for the Pass rates card.'),
      metrics: z
        .record(z.string(), z.union([z.string(), z.number()]))
        .optional()
        .describe(
          'Flat EDS-style keys merged into banner and insight cards when structured fields are omitted, e.g. metadata.*, overallStatus.*, summary.*, and overallScores.uiQualityScore (plus other overallScores.*) to populate domain rows when domains[] is omitted.'
        ),
    },
    _meta: { ui: { resourceUri: PRODUCT_AUDIT_DASHBOARD_URI } },
  },
  async (args) => {
    const fallbackProjectName = 'Example Project Audit Report';
    const metrics =
      args?.metrics !== undefined
        ? Object.keys(args.metrics).length
          ? args.metrics
          : null
        : defaultAuditMetrics;
    const projectName =
      args?.projectName ??
      (metrics && metrics['metadata.projectName'] != null && String(metrics['metadata.projectName']).trim() !== ''
        ? String(metrics['metadata.projectName']).trim()
        : fallbackProjectName);
    const payload = {
      projectName,
      ...(args?.checklistSummaryLine != null && args.checklistSummaryLine !== ''
        ? { checklistSummaryLine: args.checklistSummaryLine }
        : {}),
      ...(args?.totalComplianceValue !== undefined ? { totalComplianceValue: args.totalComplianceValue } : {}),
      ...(args?.overviewCenterPercent !== undefined ? { overviewCenterPercent: args.overviewCenterPercent } : {}),
      ...(args?.domains?.length ? { domains: args.domains } : {}),
      ...(args?.auditBanner && Object.keys(args.auditBanner).length ? { auditBanner: args.auditBanner } : {}),
      ...(args?.checklistSummaryMetrics && Object.keys(args.checklistSummaryMetrics).length
        ? { checklistSummaryMetrics: args.checklistSummaryMetrics }
        : {}),
      ...(args?.passRates && Object.keys(args.passRates).length ? { passRates: args.passRates } : {}),
      ...(args?.locale != null && args.locale !== '' ? { locale: args.locale } : {}),
      ...(metrics ? { metrics } : {}),
    };
    const dataJson = JSON.stringify(payload);
    const dataEnc = encodeURIComponent(dataJson);
    const resourceWithData =
      dataJson.length < 6000
        ? `${PRODUCT_AUDIT_DASHBOARD_URI}?data=${dataEnc}`
        : PRODUCT_AUDIT_DASHBOARD_URI;

    return {
      content: [
        {
          type: 'text',
          text: `Audit dashboard: ${payload.projectName}${payload.metrics?.['overallStatus.ragRating'] != null ? `; RAG ${payload.metrics['overallStatus.ragRating']}` : ''}${payload.metrics?.['summary.totalChecks'] != null ? `; ${payload.metrics['summary.totalChecks']} checks` : ''}. Open the MCP App resource for the full view.`,
        },
      ],
      structuredContent: {
        productAuditDashboard: payload,
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
    description: 'Write computed metric values to the metrics CSV. Accepts a flat key-value object where keys match the dot-notation keys in Metrics.csv. Unrecognised keys are ignored.',
    inputSchema: {
      metrics: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).describe('Flat key-value object of computed metric values, e.g. { "metadata.projectName": "MyApp", "overallScores.uiQualityScore": 78.5 }.'),
    },
  },
  async ({ metrics }) => {
    const filename = config.templates['metrics'];
    const filePath = resolve(config.workspaceDir, filename);
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
