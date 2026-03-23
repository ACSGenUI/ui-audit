#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import LockManager from './lock-manager.js';
import CsvManager from './csv-manager.js';
import LocalAuditTool from './local-audit-tool.js';
import { validatePayload } from './validator.js';
import { readFile, writeFile, copyFile, access, mkdir, readdir, unlink } from 'fs/promises';
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

server.registerResource(
  'metrics-template',
  'audit://templates/metrics',
  { description: 'The Metrics output template CSV (key-value pairs derived from Code Audit and Browser Audit results).' },
  async (uri) => {
    const content = await readFile(resolve(config.templatesDir, config.templates['metrics']), 'utf-8');
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
5. When pending = 0, call \`cleanup-workspace\` — removes any auto-generated JSON, MD, and Python files, keeping only CSVs.
6. Report a brief summary to the user.

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
  'start-metrics-generation',
  {
    description: 'Generate a Metrics report from completed Code Audit and Browser Audit results. Asks for project metadata before beginning.',
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

**Summary counts**
- \`summary.codeAuditTotal / Passed / Failed\` — totals for the code-audit checklist only.
- \`summary.browserAuditTotal / Passed / Failed\` — totals for the browser-audit checklist only.
- \`summary.totalChecks\` = codeAuditTotal + browserAuditTotal.
- \`summary.passed / failed\` = combined Yes / No counts.
- \`summary.notApplicable\` = rows where \`Implemented? (Yes / No)\` is empty.
- \`summary.mandatoryFailed\` = No rows where \`Mandatory\` is "Yes".
- \`summary.criticalFailed\` = No rows where \`Importance\` is "Critical".
- \`summary.highFailed\` = No rows where \`Importance\` is "High".
- \`summary.mediumFailed\` = No rows where \`Importance\` is "Medium".

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
- \`overallStatus.ragRating\` = "Red" if uiQualityScore < 60, "Amber" if 60–79, "Green" if ≥ 80.
- \`overallStatus.mandatoryPassRate\` = (mandatory rows that passed / total mandatory rows) × 100, rounded to 1 decimal.
- \`overallStatus.criticalPassRate\` = same formula for Critical importance rows.

**Overall scores**
- \`overallScores.uiQualityScore\` = weighted average: accessibility 20%, performance 20%, codeQuality 20%, security 15%, html 10%, javascript 10%, processGovernance 5%.
- All other \`overallScores.*\` = the corresponding domain score.

**Trend snapshot** — set to current computed values (no prior run available):
- Copy current \`overallScores\` and \`summary.totalIssues / criticalIssues\` values.

**Top issues** — up to 10
- Select failed ("No") rows sorted by: Importance (Critical first → High → Medium) then Mandatory (Yes before No).
- Fill \`topIssues.1\` through \`topIssues.10\` with: auditType (Code Audit / Browser Audit), severity (Importance value), mandatory, group, subGroup, description (Checklist Item text, truncated to 200 chars), evidence (Evidence column value).
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

### Step 5 — Cleanup
7. Call \`cleanup-workspace\` — removes any auto-generated JSON, MD, and Python files from the workspace, keeping only CSVs.

### Step 6 — Report
8. Print a concise summary table: RAG rating, uiQualityScore, domain scores, criticalFailed count, mandatoryFailed count, and the path to the generated metrics file.

## Rules
- Use ONLY \`read-full-checklist\` to read audit data — do NOT call \`read-checklist-row\` one row at a time.
- Leave a metric value as empty string ("") if it cannot be derived from the audit data — do NOT guess or fabricate values.
- Never stop mid-generation.`,
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
      templateName: z.enum(['code-audit', 'browser-audit', 'metrics']).describe('Which audit is being run: "code-audit", "browser-audit", or "metrics".'),
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
      templateName: z.enum(['code-audit', 'browser-audit', 'metrics']).describe('Which template to download: "code-audit", "browser-audit", or "metrics".'),
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
      templateName: z.enum(['code-audit', 'browser-audit']).describe('Which completed checklist to read: "code-audit" or "browser-audit".'),
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
    description: 'Write computed metric values to the metrics CSV. Accepts a flat key-value object where keys match the dot-notation keys in EDS_Metrics.csv. Unrecognised keys are ignored.',
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
