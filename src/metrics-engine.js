/**
 * metrics-engine.js
 *
 * Deterministic computation of all ~450 metric values from completed
 * Code Audit, Browser Audit, and Manual Checklist rows.
 *
 * Export: computeAllMetrics(codeRows, browserRows, manualRows, metadata)
 *   → flat Record<string, string> matching every key in Metrics.csv
 */

// ── Helpers ──────────────────────────────────────────────────────────

const IMPL_COL = 'Implemented? (Yes / No)';

function isPassed(row) {
  return (row[IMPL_COL] || '').trim().toLowerCase() === 'yes';
}
function isFailed(row) {
  return (row[IMPL_COL] || '').trim().toLowerCase() === 'no';
}
function isAnswered(row) {
  const v = (row[IMPL_COL] || '').trim().toLowerCase();
  return v === 'yes' || v === 'no';
}
function round1(n) {
  return Math.round(n * 10) / 10;
}

/** Extract first integer from a string, fallback to def. */
function extractInt(text, def = '') {
  if (!text) return def;
  const m = text.match(/(\d+)/);
  return m ? m[1] : def;
}

/** Extract first number (int or float) from a string. */
function extractNumber(text, def = '') {
  if (!text) return def;
  const m = text.match(/(\d+\.?\d*)/);
  return m ? m[1] : def;
}

/**
 * Find row by substring match on Checklist Item column (case-insensitive).
 * Returns the first matching row or undefined.
 */
function findRow(rows, substring) {
  const lower = substring.toLowerCase();
  return rows.find((r) => (r['Checklist Item'] || '').toLowerCase().includes(lower));
}

/** Standard pass/fail → "1" / "0" / "" */
function passfail(row) {
  if (!row) return '';
  if (isPassed(row)) return '1';
  if (isFailed(row)) return '0';
  return '';
}

/** Inverted: "0" if Yes (no issue = good), "1" if No (has issue = bad), "" if empty. */
function passfailInverted(row) {
  if (!row) return '';
  if (isPassed(row)) return '0';
  if (isFailed(row)) return '1';
  return '';
}

/** Count-type: extract integer from Comments/Evidence if failed, 0 if passed, "" if empty. */
function countMetric(row) {
  if (!row) return '';
  if (isPassed(row)) return '0';
  if (isFailed(row)) {
    const comments = row['Comments'] || '';
    const evidence = row['Evidence'] || '';
    return extractInt(comments) || extractInt(evidence) || '0';
  }
  return '';
}

// ── Domain filters ───────────────────────────────────────────────────

const DEV_GROUPS_CODE = new Set([
  'HTML Semantics & Structure',
  'HTML Forms & Inputs',
  'HTML Media & Data',
  'HTML Metadata & Validation',
  'CSS Architecture & Tokens',
  'Layout & Responsiveness',
  'Performance & Misc - CSS',
  'JavaScript Architecture & Loading',
  'JavaScript DOM & Performance Safety',
  'JavaScript State & Reliability',
  'JavaScript Code Structure & Hygiene',
  'Code Quality - Hygiene & Safety',
  'Code Quality - Structure & Readability',
  'Code Quality - Errors & Reliability',
  'Code Quality - Architecture & Dependencies',
]);

const GOVERNANCE_GROUPS_CODE = new Set([
  'Version Control & Repository',
  'Testing & Quality Gates',
  'Project Configuration',
  'GenAI Tools & Code Quality',
]);

const DOMAIN_FILTERS = {
  discovery: (row, src) => src === 'manual' && row.Phase === 'Discovery',
  contentQuality: (row, src) => src === 'manual' && row.Phase === 'Content Quality',
  internationalization: (row, src) => src === 'manual' && row.Phase === 'Internationalization',
  design: (row, src) => src === 'manual' && row.Phase === 'Design',
  userExperience: (row, src) => src === 'manual' && row.Phase === 'User Experience',
  visualDesign: (row, src) => src === 'manual' && row.Phase === 'Visual Design',
  setup: (row, src) => src === 'manual' && row.Phase === 'Setup',
  development: (row, src) =>
    (src === 'code' && DEV_GROUPS_CODE.has(row.Group)) ||
    (src === 'browser' && row.Phase === 'Development'),
  architectureReview: (row, src) => src === 'manual' && row.Phase === 'Architecture & Code Review',
  testing: (row, src) => src === 'manual' && row.Phase === 'Testing',
  security: (_row, _src) => _row.Phase === 'Security',
  performance: (row, src) =>
    row.Phase === 'Performance' || (src === 'code' && row.Group === 'Performance & Misc - CSS'),
  accessibility: (_row, _src) => _row.Phase === 'Accessibility',
  authorValidation: (row, src) => src === 'manual' && row.Phase === 'Author Validation',
  preGoLive: (row, src) => src === 'manual' && row.Phase === 'Pre-GoLive',
  postGoLive: (row, src) => src === 'manual' && row.Phase === 'Post-GoLive',
  processGovernance: (row, src) =>
    (src === 'code' && GOVERNANCE_GROUPS_CODE.has(row.Group)) ||
    (src === 'manual' && row.Phase === 'Process & Governance'),
};

const DOMAIN_WEIGHTS = {
  accessibility: 0.15,
  performance: 0.15,
  security: 0.15,
  development: 0.15,
  processGovernance: 0.05,
  testing: 0.05,
  discovery: 0.03,
  design: 0.03,
  setup: 0.03,
  contentQuality: 0.03,
  userExperience: 0.03,
  visualDesign: 0.03,
  preGoLive: 0.03,
  postGoLive: 0.03,
  authorValidation: 0.02,
  architectureReview: 0.02,
  internationalization: 0.02,
};

const SEVERITY_ORDER = { Critical: 0, High: 1, Medium: 2 };

// ── Granular item mappings ───────────────────────────────────────────
//
// Each entry: { match, type, pattern?, group? }
//   match:   substring to find in Checklist Item
//   type:    'passfail' | 'inverted' | 'count' | 'extract'
//   pattern: regex for extract type (optional)
//   group:   disambiguate when match string appears in multiple Groups

const BROWSER_MAPPINGS = {
  // accessibility
  'browser.accessibility.skipLinksImplemented': { match: 'Skip links implemented', type: 'passfail' },
  'browser.accessibility.lighthouseAccessibilityScore': { match: 'Lighthouse accessibility score', type: 'extract', pattern: /(?:score|Score)[:\s]*(\d+)/i },
  'browser.accessibility.wcagViolationsCritical': { match: 'Lighthouse accessibility score', type: 'extract', pattern: /critical[:\s]*(\d+)/i },
  'browser.accessibility.wcagViolationsTotal': { match: 'Lighthouse accessibility score', type: 'extract', pattern: /(?:total|violations)[:\s]*(\d+)/i },

  // security
  'browser.security.inlineScriptsWithoutNonce': { match: 'No inline scripts without nonce', type: 'passfail' },
  'browser.security.formActionsUseHttps': { match: 'Form actions use HTTPS', type: 'passfail' },
  'browser.security.cspHeaderPresent': { match: 'Content-Security-Policy', type: 'passfail' },
  'browser.security.cspHasUnsafeDirectives': { match: 'Content-Security-Policy', type: 'inverted' },
  'browser.security.xContentTypeOptionsPresent': { match: 'X-Content-Type-Options', type: 'passfail' },
  'browser.security.xFrameOptionsOrCspFrameAncestors': { match: 'X-Content-Type-Options', type: 'passfail' },
  'browser.security.referrerPolicyPresent': { match: 'X-Content-Type-Options', type: 'passfail' },
  'browser.security.zeroJsErrorsInConsole': { match: 'Zero JavaScript errors', type: 'passfail' },
  'browser.security.noDeprecatedApiWarnings': { match: 'No deprecated browser API', type: 'passfail' },
  'browser.security.mixedContentDetected': { match: 'No mixed content warnings', type: 'inverted' },
  'browser.security.tlsCertificateValid': { match: 'TLS certificate valid', type: 'passfail' },
  'browser.security.sensitiveDataInClientStorage': { match: 'No sensitive data', type: 'inverted' },
  'browser.security.cookieSameSiteSecureFlags': { match: 'Cookies used for session management have SameSite', type: 'passfail' },
  'browser.security.websocketUsesWss': { match: 'WebSocket connections use wss', type: 'passfail' },
  'browser.security.noCspViolationsInConsole': { match: 'No resources loaded from origins not listed in CSP', type: 'passfail' },

  // performance
  'browser.performance.lazyLoadingBelowFold': { match: 'Lazy loading for below-the-fold', type: 'passfail' },
  'browser.performance.cssDeliveryOptimized': { match: 'CSS delivery optimized', type: 'passfail' },
  'browser.performance.unusedJsRemoved': { match: 'Unused JS removed', type: 'passfail' },
  'browser.performance.webfontUsesWoff2': { match: 'Webfont files use WOFF2', type: 'passfail' },
  'browser.performance.lighthousePerformanceScore': { match: 'Lighthouse performance score', type: 'extract', pattern: /(?:score|Score)[:\s]*(\d+)/i },
  'browser.performance.lcpMs': { match: 'LCP', type: 'extract', pattern: /LCP[^;]*?(\d+\.?\d*)\s*(?:ms|s)?/i },
  'browser.performance.clsScore': { match: 'CLS', type: 'extract', pattern: /CLS[^;]*?(\d+\.?\d*)/i },
  'browser.performance.inpMs': { match: 'INP', type: 'extract', pattern: /INP[^;]*?(\d+\.?\d*)\s*(?:ms)?/i },
  'browser.performance.longTasksOnMainThread': { match: 'No JavaScript long tasks', type: 'inverted' },
  'browser.performance.tbtWithinBudget': { match: 'No JavaScript long tasks', type: 'passfail' },
  'browser.performance.ttfbMs': { match: 'Time to First Byte', type: 'extract', pattern: /(\d+\.?\d*)\s*(?:ms)/i },
  'browser.performance.lighthouseSeoScore': { match: 'Lighthouse SEO score', type: 'extract', pattern: /SEO[^;]*?(\d+)/i },
  'browser.performance.lighthouseBestPracticesScore': { match: 'Lighthouse SEO score', type: 'extract', pattern: /(?:Best Practices|BP)[^;]*?(\d+)/i },
  'browser.performance.totalPageWeightKb': { match: 'Total page weight', type: 'extract', pattern: /(\d+\.?\d*)\s*(?:KB|kb|kB)/i },
  'browser.performance.compressionEnabled': { match: 'Text resources served with gzip', type: 'passfail' },
  'browser.performance.imageOptimizationIssues': { match: 'All images within size budget', type: 'count' },
  'browser.performance.resourcesOverHttp2OrHttp3': { match: 'Resources served over HTTP/2', type: 'passfail' },
  'browser.performance.unusedJsCssPercent': { match: 'JavaScript and CSS coverage', type: 'extract', pattern: /(\d+\.?\d*)%/ },
  'browser.performance.fcpMs': { match: 'FCP', type: 'extract', pattern: /FCP[^;]*?(\d+\.?\d*)\s*(?:ms|s)?/i },
  'browser.performance.speedIndexMs': { match: 'Speed Index', type: 'extract', pattern: /Speed Index[^;]*?(\d+\.?\d*)\s*(?:ms|s)?/i },
  'browser.performance.duplicateNetworkRequests': { match: 'No duplicate network requests', type: 'count' },

  // development
  'browser.development.metaDescriptionPresent': { match: 'Meta description tag present', type: 'passfail' },
  'browser.development.metaDescriptionLength': { match: 'Meta description tag present', type: 'extract', pattern: /(\d+)\s*(?:char|characters)/i },
  'browser.development.faviconPresent': { match: 'Favicon', type: 'passfail' },
  'browser.development.canonicalUrlPresent': { match: 'Canonical URL', type: 'passfail' },
  'browser.development.hreflangImplemented': { match: 'Alternate language annotations', type: 'passfail' },
  'browser.development.cssBeforeScriptsInHead': { match: 'CSS link and style tags appear before script tags', type: 'passfail' },
  'browser.development.externalLinksHaveNoopener': { match: 'External links with target', type: 'passfail' },
  'browser.development.customErrorPagesExist': { match: 'Custom error pages', type: 'passfail' },
  'browser.development.responsiveAtAllBreakpoints': { match: 'Page layout tested at standard breakpoints', type: 'passfail' },
  'browser.development.clsInPerformancePanel': { match: 'CLS < 0.1 verified in', type: 'passfail' },
  'browser.development.noRenderBlockingResources': { match: 'No render-blocking resources', type: 'passfail' },
  'browser.development.noConsoleLogInProduction': { match: 'No console.log', type: 'passfail' },
  'browser.development.noViolationMessagesInConsole': { match: 'Violation', type: 'passfail' },
  'browser.development.noForcedSyncLayoutsInFlameChart': { match: 'No forced synchronous layouts', type: 'passfail' },
  'browser.development.noExcessiveRepaintsOnScroll': { match: 'No excessive repaints', type: 'passfail' },
  'browser.development.noDetachedDomNodes': { match: 'No detached DOM nodes', type: 'passfail' },
  'browser.development.preloadedResourcesConsumed': { match: 'Preloaded resources', type: 'passfail' },
  'browser.development.webFontsLoadWithoutFoit': { match: 'Web fonts load without FOIT', type: 'passfail' },
};

const CODE_MAPPINGS = {
  // html.semantics
  'code.html.semantics.semanticToDivRatioPass': { match: 'Semantic-to-div ratio', type: 'passfail' },
  'code.html.semantics.headingHierarchyCorrect': { match: 'Correct heading hierarchy', type: 'passfail' },
  'code.html.semantics.singleH1PerPage': { match: 'Single h1 per page', type: 'passfail' },

  // html.structure
  'code.html.structure.domSourceOrderMatchesTabOrder': { match: 'DOM source order matches visual tab order', type: 'passfail' },
  'code.html.structure.criticalContentInRawHtml': { match: 'Page content hierarchy intact', type: 'passfail' },
  'code.html.structure.excessiveDomDepth': { match: 'Avoid excessive DOM depth', type: 'inverted' },

  // html.forms
  'code.html.forms.radioCheckboxHaveFieldsetLegend': { match: 'Radio/checkbox groups wrapped', type: 'passfail' },
  'code.html.forms.allInputsHaveLabels': { match: 'All inputs have associated labels', type: 'passfail' },
  'code.html.forms.missingLabelsCount': { match: 'All inputs have associated labels', type: 'count' },
  'code.html.forms.placeholderUsedAsLabel': { match: 'Placeholder not used as label', type: 'inverted' },
  'code.html.forms.errorMessagesLinkedToInputs': { match: 'Error messages programmatically associated', type: 'passfail' },
  'code.html.forms.interactiveElementsHaveAccessibleNames': { match: 'Accessible names for interactive elements', type: 'passfail' },
  'code.html.forms.inlineStylesCount': { match: 'Avoid inline styles', type: 'count' },

  // html.media
  'code.html.media.decorativeImagesHaveEmptyAlt': { match: "Images with role='presentation'", type: 'passfail' },
  'code.html.media.altTextQualityPass': { match: 'Alt text is not a filename', type: 'passfail' },
  'code.html.media.missingOrInvalidAltCount': { match: 'Alt text is not a filename', type: 'count' },
  'code.html.media.tablesHaveTheadTbody': { match: 'Tables use thead and tbody', type: 'passfail' },
  'code.html.media.tableHeadersUseTh': { match: 'Table headers use th', type: 'passfail' },
  'code.html.media.listsUseUlOrOlCorrectly': { match: 'Lists use ul or ol correctly', type: 'passfail' },
  'code.html.media.imgElementsHaveDimensionsForCls': { match: 'Content img elements have explicit width and height', type: 'passfail' },

  // html.metadata
  'code.html.metadata.pageTitlePresent': { match: 'Page <title> exists', type: 'passfail' },
  'code.html.metadata.pageTitleQualityPass': { match: 'Page <title> exists', type: 'passfail' },
  'code.html.metadata.metaViewportConfigured': { match: 'Meta viewport configured', type: 'passfail' },
  'code.html.metadata.charsetDeclaredInHead': { match: 'Charset meta tag', type: 'passfail' },
  'code.html.metadata.langAttributeValid': { match: 'Language attribute (lang)', type: 'passfail' },
  'code.html.metadata.dirAttributeForRtl': { match: 'Direction attribute (dir)', type: 'passfail' },
  'code.html.metadata.duplicateIdsCount': { match: 'No duplicate IDs', type: 'count' },
  'code.html.metadata.invalidHtmlNestingCount': { match: 'No invalid HTML nesting', type: 'count' },
  'code.html.metadata.htmlValidationErrorCount': { match: 'HTML validates without errors', type: 'count' },
  'code.html.metadata.ariaRolesDontDuplicateSemantics': { match: 'ARIA roles do not duplicate native', type: 'passfail' },
  'code.html.metadata.noAriaMisuse': { match: 'Avoid misuse of ARIA roles', type: 'passfail' },
  'code.html.metadata.ariaUsedOnlyWhenNecessary': { match: 'ARIA used only when necessary', type: 'passfail' },
  'code.html.metadata.metaTagsDoNotBlockZoom': { match: 'Meta tags do not block zoom', type: 'passfail' },
  'code.html.metadata.brokenLinksCount': { match: 'No broken links', type: 'count' },

  // css.tokens
  'code.css.tokens.cssVarsUsedForColors': { match: 'CSS variables used for all colors', type: 'passfail' },
  'code.css.tokens.cssVarsUsedForSpacing': { match: 'CSS variables used for spacing', type: 'passfail' },
  'code.css.tokens.cssVarsUsedForTypography': { match: 'CSS variables used for typography', type: 'passfail' },
  'code.css.tokens.cssVarsUsedForFontFamily': { match: 'Font-family declarations defined at :root', type: 'passfail' },
  'code.css.tokens.hardcodedHexOrRgbCount': { match: 'No hardcoded hex/rgb color', type: 'count' },
  'code.css.tokens.hardcodedPixelSpacingCount': { match: 'No hardcoded pixel spacing', type: 'count' },

  // css.maintainability
  'code.css.maintainability.namingConventionsConsistent': { match: 'Consistent naming conventions', type: 'passfail', group: 'CSS Architecture & Tokens' },
  'code.css.maintainability.classNamesAvoidColorOrPosition': { match: 'Class names do not contain hex', type: 'passfail' },
  'code.css.maintainability.selectorsColocatedInSameFile': { match: 'CSS selectors for same component co-located', type: 'passfail' },
  'code.css.maintainability.printStylesheetHidesNonEssential': { match: 'CSS print stylesheet', type: 'passfail' },

  // css.layout
  'code.css.layout.modernLayoutUsed': { match: 'Layout containers use display:flex', type: 'passfail' },
  'code.css.layout.mobileFirstMediaQueries': { match: 'min-width media queries outnumber', type: 'passfail' },
  'code.css.layout.standardBreakpointsOnly': { match: 'Standard breakpoints only', type: 'passfail' },
  'code.css.layout.responsiveImagesByDefault': { match: 'Responsive images by default', type: 'passfail' },
  'code.css.layout.zIndexEscalationIssues': { match: 'Avoid z-index escalation', type: 'inverted' },

  // css.performance
  'code.css.performance.noExpensiveBoxShadows': { match: 'Avoid expensive box-shadows', type: 'passfail' },
  'code.css.performance.noHeavyCssFilters': { match: 'Avoid heavy CSS filters', type: 'passfail' },
  'code.css.performance.noInfiniteAnimationsOnNonLoaders': { match: 'No infinite CSS animations', type: 'passfail' },
  'code.css.performance.cssCompatibilityIssuesCount': { match: 'All CSS properties/values supported', type: 'count' },
  'code.css.performance.vendorPrefixIssues': { match: 'Avoid vendor prefixes', type: 'inverted' },

  // css.quality
  'code.css.quality.duplicateCssRulesCount': { match: 'No duplicated CSS rules', type: 'count' },
  'code.css.quality.unusedCssSelectorsCount': { match: 'No unused CSS selectors', type: 'count' },
  'code.css.quality.propertyOrderingConsistent': { match: 'Consistent property ordering', type: 'passfail' },

  // javascript.loading
  'code.javascript.loading.noBlockingScriptsInHead': { match: 'No blocking scripts in head', type: 'passfail' },
  'code.javascript.loading.asyncOrDeferUsed': { match: 'Use async or defer', type: 'passfail' },
  'code.javascript.loading.thirdPartyScriptsLazyLoaded': { match: 'Third-party scripts lazy loaded', type: 'passfail' },
  'code.javascript.loading.noUnusedModulesLoaded': { match: 'No JS files loaded on pages where their exports are unused', type: 'passfail' },
  'code.javascript.loading.noMarketingTagsInHead': { match: 'No marketing tags in head', type: 'passfail' },
  'code.javascript.loading.userFacingStringsUseI18nKeys': { match: 'User-facing strings', type: 'passfail' },
  'code.javascript.loading.noBinariesInRepo': { match: 'No binaries stored in repository', type: 'passfail' },
  'code.javascript.loading.errorMessagesFollowPattern': { match: 'Error messages follow consistent pattern', type: 'passfail' },

  // javascript.dom
  'code.javascript.dom.noTightDomCoupling': { match: 'Avoid tight DOM coupling', type: 'passfail' },
  'code.javascript.dom.noForcedSyncLayoutsInCode': { match: 'Avoid forced synchronous layouts', type: 'passfail' },
  'code.javascript.dom.timerLeaksCount': { match: 'All setTimeout/setInterval calls have corresponding clear', type: 'count' },
  'code.javascript.dom.pollingWithoutObserverCount': { match: 'setInterval for DOM/state checks flagged', type: 'count' },
  'code.javascript.dom.prefersNativeBrowserApis': { match: 'Prefer native browser APIs', type: 'passfail' },
  'code.javascript.dom.modernEs6SyntaxUsed': { match: 'Modern ES6+ syntax', type: 'passfail' },

  // javascript.state
  'code.javascript.state.noMemoryLeakRisks': { match: 'Avoid memory leaks', type: 'passfail' },
  'code.javascript.state.eventListenersCleanedUp': { match: 'Event listeners cleaned up', type: 'passfail' },
  'code.javascript.state.asyncAwaitUsed': { match: 'Async logic uses async/await', type: 'passfail' },
  'code.javascript.state.promisesHandledCorrectly': { match: 'Promises handled correctly', type: 'passfail' },
  'code.javascript.state.stateMutationThroughSetters': { match: 'State changes occur through defined setters', type: 'passfail' },
  'code.javascript.state.noSharedStateMutation': { match: 'No mutation of shared state', type: 'passfail' },
  'code.javascript.state.noSideEffectsInPureFunctions': { match: 'No side effects in pure functions', type: 'passfail' },
  'code.javascript.state.consistentReturnTypes': { match: 'Consistent return types', type: 'passfail' },
  'code.javascript.state.noStateMutationInLoops': { match: 'No setState/dispatch/state-mutation calls inside', type: 'passfail' },

  // javascript.structure
  'code.javascript.structure.globalVariablesCount': { match: 'No global variables', type: 'count' },
  'code.javascript.structure.jsScopedToComponent': { match: 'JS scoped to component or block', type: 'passfail' },
  'code.javascript.structure.codingStyleConsistent': { match: 'Consistent coding style', type: 'passfail' },
  'code.javascript.structure.deeplyNestedCallbacksCount': { match: 'Avoid deeply nested callbacks', type: 'count' },
  'code.javascript.structure.callChainDepthWithinLimit': { match: 'Call chain depth', type: 'passfail' },
  'code.javascript.structure.inputValidationPresent': { match: 'All external inputs are validated', type: 'passfail' },
  'code.javascript.structure.noUnreachableCode': { match: 'No unreachable code', type: 'passfail' },
  'code.javascript.structure.noEmptyCatchBlocks': { match: 'No empty catch blocks', type: 'passfail' },
  'code.javascript.structure.noUnusedNpmPackages': { match: 'No unused npm/yarn packages', type: 'passfail' },
  'code.javascript.structure.noUnusedComponentProps': { match: 'No unused component props', type: 'passfail' },

  // accessibility.wcag
  'code.accessibility.wcag.wcag21AAComplianceMet': { match: 'WCAG 2.1 AA compliance', type: 'passfail' },
  'code.accessibility.wcag.dynamicContentChangesAnnounced': { match: 'Announce dynamic content changes', type: 'passfail' },

  // accessibility.components
  'code.accessibility.components.modalDialogAriaCorrect': { match: "Modal/dialog elements have role='dialog'", type: 'passfail' },
  'code.accessibility.components.videoCaptionsPresent': { match: "video elements have track kind='captions'", type: 'passfail' },
  'code.accessibility.components.audioTranscriptsPresent': { match: 'audio elements have adjacent transcript', type: 'passfail' },
  'code.accessibility.components.noFocusTrapMisuse': { match: 'No focus-trap calls outside of modal', type: 'passfail' },

  // accessibility.css
  'code.accessibility.css.visibleFocusStylesPresent': { match: 'Visible focus styles present', type: 'passfail' },
  'code.accessibility.css.hoverRulesHaveFocusEquivalent': { match: ':hover rules have corresponding :focus', type: 'passfail' },
  'code.accessibility.css.visuallyHiddenPatternCorrect': { match: 'Visually-hidden patterns', type: 'passfail' },

  // security.clientCode
  'code.security.clientCode.noEvalOrFunctionString': { match: 'No eval() or Function(string)', type: 'passfail' },
  'code.security.clientCode.noDocumentWrite': { match: 'No document.write', type: 'passfail' },
  'code.security.clientCode.externalScriptsHaveSri': { match: 'External scripts use Subresource Integrity', type: 'passfail' },
  'code.security.clientCode.noUnsanitizedInnerHtml': { match: 'No unsanitized user input in innerHTML', type: 'passfail' },

  // security.secrets
  'code.security.secrets.noHardcodedApiKeys': { match: 'No hardcoded API keys', type: 'passfail' },
  'code.security.secrets.noCredentialsInUrls': { match: 'No credentials or tokens in URLs', type: 'passfail' },
  'code.security.secrets.noSensitiveDataInComments': { match: 'No sensitive data in client-side comments', type: 'passfail' },
  'code.security.secrets.noInsecureStorageForSecrets': { match: 'No insecure storage usage', type: 'passfail' },
  'code.security.secrets.noPiiInStorageWithoutConsent': { match: 'No PII stored in cookies', type: 'passfail' },

  // security.dependencies
  'code.security.dependencies.noKnownVulnerableDependencies': { match: 'No known vulnerable dependencies', type: 'passfail' },

  // security.input
  'code.security.input.noSensitiveDataInClientVisibleAttributes': { match: 'No sensitive data exposed in client-visible IDs', type: 'passfail' },

  // quality.hygiene
  'code.quality.hygiene.lintErrorsCount': { match: 'Zero lint errors', type: 'count' },
  'code.quality.hygiene.unusedVariablesCount': { match: 'No unused variables', type: 'count' },
  'code.quality.hygiene.unusedFunctionsCount': { match: 'No unused functions', type: 'count' },
  'code.quality.hygiene.unusedImportsCount': { match: 'No unused imports', type: 'count' },
  'code.quality.hygiene.deadCodePathsCount': { match: 'No dead code paths', type: 'count' },
  'code.quality.hygiene.deadCodeFilesCount': { match: 'No dead code files', type: 'count' },
  'code.quality.hygiene.commentedOutCodeCount': { match: 'No commented-out production code', type: 'count' },
  'code.quality.hygiene.implicitGlobalsCount': { match: 'No implicit globals', type: 'count' },
  'code.quality.hygiene.fileStructureConsistent': { match: 'Consistent file structure', type: 'passfail' },
  'code.quality.hygiene.duplicateConstantsCount': { match: 'No duplicated constants', type: 'count' },

  // quality.readability
  'code.quality.readability.variableNamingViolationsCount': { match: 'Variable names >2 characters', type: 'count' },
  'code.quality.readability.functionNamingViolationsCount': { match: 'Function names start with verb', type: 'count' },
  'code.quality.readability.namingConventionsConsistent': { match: 'Consistent naming conventions', type: 'passfail', group: 'Code Quality - Structure & Readability' },
  'code.quality.readability.complexConditionsCount': { match: 'No nested ternary', type: 'count' },
  'code.quality.readability.missingGuardClausesCount': { match: 'Functions with if-block wrapping', type: 'count' },
  'code.quality.readability.oversizedFilesOrFunctionsCount': { match: 'Average file size under 500 LOC', type: 'count' },
  'code.quality.readability.singleResponsibilityViolationsCount': { match: 'Files have single responsibility', type: 'count' },
  'code.quality.readability.readmePresent': { match: 'README present', type: 'passfail' },

  // quality.reliability
  'code.quality.reliability.inconsistentErrorHandlingCount': { match: 'Consistent error handling strategy', type: 'count' },
  'code.quality.reliability.poorErrorLoggingCount': { match: 'Errors logged meaningfully', type: 'count' },
  'code.quality.reliability.ungracefulErrorsCount': { match: 'Errors fail gracefully', type: 'count' },
  'code.quality.reliability.magicNumbersCount': { match: 'Avoid magic numbers', type: 'count' },
  'code.quality.reliability.uncentralizedConstantsCount': { match: 'Constants centralized', type: 'count' },
  'code.quality.reliability.hardcodedBehaviorCount': { match: 'Config-driven behavior', type: 'count' },
  'code.quality.reliability.duplicatedUtilitiesCount': { match: 'Shared utilities extracted', type: 'count' },
  'code.quality.reliability.duplicateCodePercent': { match: 'Duplicate code percentage', type: 'extract', pattern: /(\d+\.?\d*)%/ },

  // quality.architecture
  'code.quality.architecture.hardcodedEnvValuesCount': { match: 'No hardcoded environment values', type: 'count' },
  'code.quality.architecture.circularDependenciesCount': { match: 'Avoid circular dependencies', type: 'count' },
  'code.quality.architecture.staleTodoFixmeCount': { match: 'No stale TODO/FIXME', type: 'count' },

  // governance
  'code.governance.vcs.gitRepositoryInitialized': { match: 'Git repository initialized', type: 'passfail' },
  'code.governance.vcs.gitignorePresent': { match: '.gitignore file present', type: 'passfail' },
  'code.governance.vcs.lockfileCommitted': { match: 'Package lock file', type: 'passfail' },
  'code.governance.quality.preCommitHooksConfigured': { match: 'Pre-commit hooks configured', type: 'passfail' },
  'code.governance.config.nodeVersionSpecified': { match: 'Node.js version specified', type: 'passfail' },
  'code.governance.genai.noMockDataInProduction': { match: 'Hardcoded mock data', type: 'inverted' },
};

/** Manual mappings: key → { phase, index } (row position within that Phase, 0-based). */
const MANUAL_MAPPINGS = {
  'manual.discovery.businessObjectivesAndKpisDefined': { phase: 'Discovery', index: 0 },
  'manual.discovery.targetAudienceAndPersonasDefined': { phase: 'Discovery', index: 1 },
  'manual.discovery.cdnProviderAndRepoIdentified': { phase: 'Discovery', index: 2 },
  'manual.discovery.edsAuthoringAndContentRequirementsDefined': { phase: 'Discovery', index: 3 },
  'manual.discovery.edsBlockRequirementsAndStructureDefined': { phase: 'Discovery', index: 4 },
  'manual.discovery.integrationAndMarTechRequirementsDefined': { phase: 'Discovery', index: 5 },
  'manual.discovery.nonFunctionalRequirementsDefined': { phase: 'Discovery', index: 6 },
  'manual.discovery.seoRoutingAndLocalizationDefined': { phase: 'Discovery', index: 7 },
  'manual.design.hldDocumented': { phase: 'Design', index: 0 },
  'manual.design.blockAndFragmentDesignComplete': { phase: 'Design', index: 1 },
  'manual.design.performanceByDesignGoalsDefined': { phase: 'Design', index: 2 },
  'manual.design.responsiveAndAccessibilityStrategyDefined': { phase: 'Design', index: 3 },
  'manual.design.seoAndErrorStrategyDesigned': { phase: 'Design', index: 4 },
  'manual.setup.cdnConfigured': { phase: 'Setup', index: 0 },
  'manual.setup.repoAndContentSourceConfigured': { phase: 'Setup', index: 1 },
  'manual.setup.aemSidekickInstalledAndConfigured': { phase: 'Setup', index: 2 },
  'manual.setup.ciCdPipelineConfigured': { phase: 'Setup', index: 3 },
  'manual.setup.devStagingProdEnvironmentsSetUp': { phase: 'Setup', index: 4 },
  'manual.setup.prProcessAndBranchingStrategyDefined': { phase: 'Setup', index: 5 },
  'manual.setup.i18nAndTranslationSetup': { phase: 'Setup', index: 6 },
  'manual.visualDesign.uiMatchesDesignMockupsAtAllViewports': { phase: 'Visual Design', index: 0 },
  'manual.visualDesign.brandingAndInteractiveStatesConsistent': { phase: 'Visual Design', index: 1 },
  'manual.userExperience.coreUserFlowsIntuitive': { phase: 'User Experience', index: 0 },
  'manual.userExperience.loadingEmptyErrorStatesPresent': { phase: 'User Experience', index: 1 },
  'manual.userExperience.formValidationUxVerified': { phase: 'User Experience', index: 2 },
  'manual.contentQuality.copySpellingGrammarLegalTextVerified': { phase: 'Content Quality', index: 0 },
  'manual.contentQuality.cookieConsentMeetsGdprCcpa': { phase: 'Content Quality', index: 1 },
  'manual.testing.contentPreviewAndPublishWorkflowValidated': { phase: 'Testing', index: 0 },
  'manual.testing.functionalAndE2ETestingComplete': { phase: 'Testing', index: 1 },
  'manual.testing.unitTestsAutomatedInCiCd': { phase: 'Testing', index: 2 },
  'manual.testing.rumSetUpAndConfigured': { phase: 'Testing', index: 3 },
  'manual.testing.crossBrowserAndDeviceTestingComplete': { phase: 'Testing', index: 4 },
  'manual.security.apiEndpointsSecured': { phase: 'Security', index: 0 },
  'manual.security.rbacImplemented': { phase: 'Security', index: 1 },
  'manual.security.dataEncryptionAndGdprCompliant': { phase: 'Security', index: 2 },
  'manual.security.secretsManagementAndPenTestingDone': { phase: 'Security', index: 3 },
  'manual.authorValidation.authorTrainingAndSidekickVerified': { phase: 'Author Validation', index: 0 },
  'manual.authorValidation.authorWorkflowValidatedInDocsSheets': { phase: 'Author Validation', index: 1 },
  'manual.authorValidation.blockUsabilityReviewComplete': { phase: 'Author Validation', index: 2 },
  'manual.authorValidation.documentToWebRenderingValidated': { phase: 'Author Validation', index: 3 },
  'manual.performance.cdnCachingStrategyValidated': { phase: 'Performance', index: 0 },
  'manual.performance.rumMonitoringAndAlertsConfigured': { phase: 'Performance', index: 1 },
  'manual.performance.aboveTheFoldLoadsWithin2500ms': { phase: 'Performance', index: 2 },
  'manual.accessibility.screenReaderTestingComplete': { phase: 'Accessibility', index: 0 },
  'manual.accessibility.keyboardOnlyNavigationTested': { phase: 'Accessibility', index: 1 },
  'manual.accessibility.axeWaveToolsRunAndRemediated': { phase: 'Accessibility', index: 2 },
  'manual.i18n.rtlLayoutVerified': { phase: 'Internationalization', index: 0 },
  'manual.i18n.textExpansionDoesNotBreakLayout': { phase: 'Internationalization', index: 0 },
  'manual.i18n.localeFormattingCorrect': { phase: 'Internationalization', index: 0 },
  'manual.architectureReview.designTokensMatchFigma': { phase: 'Architecture & Code Review', index: 0 },
  'manual.architectureReview.webfontStrategyReviewed': { phase: 'Architecture & Code Review', index: 1 },
  'manual.preGoLive.cdnCachingAndDnsFinalized': { phase: 'Pre-GoLive', index: 0 },
  'manual.preGoLive.deploymentAndRollbackPlanCreated': { phase: 'Pre-GoLive', index: 1 },
  'manual.preGoLive.previewAndLiveDomainValidated': { phase: 'Pre-GoLive', index: 2 },
  'manual.preGoLive.finalE2eSmokeLoadTestingComplete': { phase: 'Pre-GoLive', index: 3 },
  'manual.preGoLive.seoLaunchReadinessVerified': { phase: 'Pre-GoLive', index: 4 },
  'manual.postGoLive.centralizedLoggingAndAlertsConfigured': { phase: 'Post-GoLive', index: 0 },
  'manual.postGoLive.cwvRumCdnMonitoringSetup': { phase: 'Post-GoLive', index: 1 },
  'manual.postGoLive.authorSupportAndHelpdeskEstablished': { phase: 'Post-GoLive', index: 2 },
  'manual.postGoLive.incidentResponseAndSlasDefined': { phase: 'Post-GoLive', index: 3 },
  'manual.postGoLive.seoIndexingAndAnalyticsMonitored': { phase: 'Post-GoLive', index: 4 },
  'manual.postGoLive.continuousImprovementPlanInPlace': { phase: 'Post-GoLive', index: 5 },
  'manual.governance.projectManagementToolActivelyUsed': { phase: 'Process & Governance', index: 0 },
  'manual.governance.codeReviewProcessWithSlaDefined': { phase: 'Process & Governance', index: 1 },
  'manual.governance.qaEnvironmentMirrorsProduction': { phase: 'Process & Governance', index: 2 },
  'manual.governance.genAiGovernancePolicyDocumented': { phase: 'Process & Governance', index: 3 },
};

// ── Computation phases ───────────────────────────────────────────────

function computeSummary(codeRows, browserRows, manualRows) {
  const m = {};
  const sources = [
    { rows: browserRows, prefix: 'summary.browserAudit' },
    { rows: codeRows, prefix: 'summary.codeAudit' },
    { rows: manualRows, prefix: 'summary.manualAudit' },
  ];

  let totalAll = 0, passedAll = 0, failedAll = 0, naAll = 0;
  let mandatoryFailed = 0, criticalFailed = 0, highFailed = 0, mediumFailed = 0;

  for (const { rows, prefix } of sources) {
    let total = rows.length, passed = 0, failed = 0, na = 0;
    for (const row of rows) {
      if (isPassed(row)) passed++;
      else if (isFailed(row)) {
        failed++;
        if ((row.Mandatory || '').toLowerCase() === 'yes') mandatoryFailed++;
        const imp = (row.Importance || '').trim();
        if (imp === 'Critical') criticalFailed++;
        else if (imp === 'High') highFailed++;
        else if (imp === 'Medium') mediumFailed++;
      } else {
        na++;
      }
    }
    m[`${prefix}.total`] = String(total);
    m[`${prefix}.passed`] = String(passed);
    m[`${prefix}.failed`] = String(failed);
    m[`${prefix}.notApplicable`] = String(na);
    totalAll += total; passedAll += passed; failedAll += failed; naAll += na;
  }

  m['summary.overall.total'] = String(totalAll);
  m['summary.overall.passed'] = String(passedAll);
  m['summary.overall.failed'] = String(failedAll);
  m['summary.overall.notApplicable'] = String(naAll);
  m['summary.overall.mandatoryFailed'] = String(mandatoryFailed);
  m['summary.overall.criticalFailed'] = String(criticalFailed);
  m['summary.overall.highFailed'] = String(highFailed);
  m['summary.overall.mediumFailed'] = String(mediumFailed);

  return m;
}

function computeDomainScores(codeRows, browserRows, manualRows) {
  const scores = {};
  const taggedRows = [
    ...codeRows.map((r) => ({ row: r, src: 'code' })),
    ...browserRows.map((r) => ({ row: r, src: 'browser' })),
    ...manualRows.map((r) => ({ row: r, src: 'manual' })),
  ];

  for (const [domain, filterFn] of Object.entries(DOMAIN_FILTERS)) {
    let answered = 0, passed = 0;
    for (const { row, src } of taggedRows) {
      if (!filterFn(row, src)) continue;
      if (!isAnswered(row)) continue;
      answered++;
      if (isPassed(row)) passed++;
    }
    scores[domain] = answered > 0 ? round1((passed / answered) * 100) : '';
  }
  return scores;
}

function computeOverallScore(domainScores) {
  let weightSum = 0, scoreSum = 0;
  for (const [domain, weight] of Object.entries(DOMAIN_WEIGHTS)) {
    const s = domainScores[domain];
    if (s === '' || s === undefined) continue;
    weightSum += weight;
    scoreSum += Number(s) * weight;
  }
  return weightSum === 0 ? '' : round1(scoreSum / weightSum);
}

function computeRisk(domainScores) {
  const m = {};
  for (const domain of Object.keys(DOMAIN_FILTERS)) {
    const s = domainScores[domain];
    if (s === '' || s === undefined) {
      m[`risk.${domain}`] = '';
    } else {
      const n = Number(s);
      m[`risk.${domain}`] = n < 60 ? 'High' : n < 80 ? 'Medium' : 'Low';
    }
  }
  return m;
}

function computeStatus(overallScore, codeRows, browserRows, manualRows) {
  const m = {};
  const allRows = [...codeRows, ...browserRows, ...manualRows];

  if (overallScore === '' || overallScore === undefined) {
    m['status.ragRating'] = '';
  } else {
    const n = Number(overallScore);
    m['status.ragRating'] = n < 60 ? 'Red' : n < 80 ? 'Amber' : 'Green';
  }

  const computeRate = (filterFn) => {
    let total = 0, passed = 0;
    for (const row of allRows) {
      if (!filterFn(row)) continue;
      if (!isAnswered(row)) continue;
      total++;
      if (isPassed(row)) passed++;
    }
    return total > 0 ? String(round1((passed / total) * 100)) : '';
  };

  m['status.mandatoryPassRate'] = computeRate((r) => (r.Mandatory || '').toLowerCase() === 'yes');
  m['status.criticalPassRate'] = computeRate((r) => (r.Importance || '').trim() === 'Critical');
  m['status.highPassRate'] = computeRate((r) => (r.Importance || '').trim() === 'High');

  let blocking = 0;
  for (const row of allRows) {
    if (isFailed(row) && (row.Mandatory || '').toLowerCase() === 'yes') blocking++;
  }
  m['status.totalBlockingIssues'] = String(blocking);
  m['status.goLiveReady'] = blocking === 0 && m['status.ragRating'] !== 'Red' ? 'Yes' : 'No';

  return m;
}

function computeTrend(overallScore, domainScores, codeRows, browserRows, manualRows) {
  const allRows = [...codeRows, ...browserRows, ...manualRows];
  return {
    'trend.totalIssues': String(allRows.filter(isFailed).length),
    'trend.criticalIssues': String(allRows.filter((r) => isFailed(r) && (r.Importance || '').trim() === 'Critical').length),
    'trend.overallCompliance': overallScore !== '' ? String(overallScore) : '',
    'trend.accessibilityCompliance': domainScores.accessibility !== '' ? String(domainScores.accessibility) : '',
    'trend.performanceCompliance': domainScores.performance !== '' ? String(domainScores.performance) : '',
    'trend.securityCompliance': domainScores.security !== '' ? String(domainScores.security) : '',
    'trend.developmentCompliance': domainScores.development !== '' ? String(domainScores.development) : '',
  };
}

function computeTopIssues(codeRows, browserRows, manualRows) {
  const m = {};
  const failedRows = [];

  const addFailed = (rows, auditType) => {
    for (const row of rows) {
      if (isFailed(row)) failedRows.push({ row, auditType });
    }
  };
  addFailed(codeRows, 'Code Audit');
  addFailed(browserRows, 'Browser Audit');
  addFailed(manualRows, 'Manual Audit');

  failedRows.sort((a, b) => {
    const sa = SEVERITY_ORDER[a.row.Importance] ?? 99;
    const sb = SEVERITY_ORDER[b.row.Importance] ?? 99;
    if (sa !== sb) return sa - sb;
    const ma = (a.row.Mandatory || '').toLowerCase() === 'yes' ? 0 : 1;
    const mb = (b.row.Mandatory || '').toLowerCase() === 'yes' ? 0 : 1;
    return ma - mb;
  });

  const top = failedRows.slice(0, 10);
  m['topIssues.count'] = String(top.length);

  for (let i = 0; i < 10; i++) {
    const prefix = `topIssues.${i + 1}`;
    if (i < top.length) {
      const { row, auditType } = top[i];
      m[`${prefix}.auditType`] = auditType;
      m[`${prefix}.phase`] = row.Phase || '';
      m[`${prefix}.group`] = row.Group || '';
      m[`${prefix}.subGroup`] = row['Sub-Group'] || '';
      m[`${prefix}.severity`] = row.Importance || '';
      m[`${prefix}.mandatory`] = row.Mandatory || '';
      m[`${prefix}.description`] = (row['Checklist Item'] || '').slice(0, 200);
      m[`${prefix}.evidence`] = row.Evidence || '';
    } else {
      m[`${prefix}.auditType`] = '';
      m[`${prefix}.phase`] = '';
      m[`${prefix}.group`] = '';
      m[`${prefix}.subGroup`] = '';
      m[`${prefix}.severity`] = '';
      m[`${prefix}.mandatory`] = '';
      m[`${prefix}.description`] = '';
      m[`${prefix}.evidence`] = '';
    }
  }
  return m;
}

function computeComponents(codeRows, browserRows) {
  const m = {};
  const pathCounts = {};

  const processRows = (rows, failedOnly) => {
    for (const row of rows) {
      if (failedOnly && !isFailed(row)) continue;
      if (!failedOnly && !isAnswered(row)) continue;
      const evidence = row.Evidence || '';
      const paths = evidence
        .split(/[,;\s]+/)
        .map((p) => p.trim())
        .filter((p) => p && (p.includes('/') || p.includes('.')) && !p.startsWith('http'));
      for (const path of paths) {
        if (!pathCounts[path]) pathCounts[path] = { failed: 0, critical: 0, total: 0 };
        if (failedOnly) {
          pathCounts[path].failed++;
          if ((row.Importance || '').trim() === 'Critical') pathCounts[path].critical++;
        } else {
          pathCounts[path].total++;
        }
      }
    }
  };

  // Count failed, then total
  processRows(codeRows, true);
  processRows(browserRows, true);
  processRows(codeRows, false);
  processRows(browserRows, false);

  const sorted = Object.entries(pathCounts)
    .filter(([, v]) => v.failed > 0)
    .sort((a, b) => b[1].failed - a[1].failed)
    .slice(0, 5);

  m['components.count'] = String(sorted.length);

  for (let i = 0; i < 5; i++) {
    const prefix = `components.${i + 1}`;
    if (i < sorted.length) {
      const [path, counts] = sorted[i];
      const name = path.split('/').pop() || path;
      const healthScore = counts.total > 0
        ? Math.round(100 - (counts.failed / counts.total) * 100)
        : 0;
      m[`${prefix}.name`] = name;
      m[`${prefix}.path`] = path;
      m[`${prefix}.failedChecks`] = String(counts.failed);
      m[`${prefix}.criticalFailures`] = String(counts.critical);
      m[`${prefix}.healthScore`] = String(healthScore);
    } else {
      m[`${prefix}.name`] = '';
      m[`${prefix}.path`] = '';
      m[`${prefix}.failedChecks`] = '';
      m[`${prefix}.criticalFailures`] = '';
      m[`${prefix}.healthScore`] = '';
    }
  }
  return m;
}

/**
 * Resolve a granular item mapping to a value.
 * The optional `group` field disambiguates when the match string
 * appears in multiple Groups (e.g. "Consistent naming conventions").
 */
function resolveMapping(rows, mapping) {
  const { match, type, pattern, group } = mapping;
  let row;
  if (group) {
    const lower = match.toLowerCase();
    row = rows.find(
      (r) => (r['Checklist Item'] || '').toLowerCase().includes(lower) && r.Group === group
    );
  } else {
    row = findRow(rows, match);
  }

  switch (type) {
    case 'passfail':
      return passfail(row);
    case 'inverted':
      return passfailInverted(row);
    case 'count':
      return countMetric(row);
    case 'extract': {
      if (!row) return '';
      const text = `${row['Comments'] || ''} ${row['Evidence'] || ''}`;
      if (pattern) {
        const hit = text.match(pattern);
        if (hit) return hit[1];
      }
      return extractNumber(text);
    }
    default:
      return '';
  }
}

function computeGranularMetrics(codeRows, browserRows, manualRows) {
  const m = {};

  for (const [key, mapping] of Object.entries(BROWSER_MAPPINGS)) {
    m[key] = resolveMapping(browserRows, mapping);
  }

  for (const [key, mapping] of Object.entries(CODE_MAPPINGS)) {
    m[key] = resolveMapping(codeRows, mapping);
  }

  // Manual metrics — positional by Phase + index
  const phaseGroups = {};
  for (const row of manualRows) {
    const phase = row.Phase || '';
    if (!phaseGroups[phase]) phaseGroups[phase] = [];
    phaseGroups[phase].push(row);
  }

  for (const [key, { phase, index }] of Object.entries(MANUAL_MAPPINGS)) {
    const rows = phaseGroups[phase] || [];
    m[key] = passfail(rows[index]);
  }

  return m;
}

// ── Main export ──────────────────────────────────────────────────────

/**
 * Compute all metric values from completed audit rows.
 *
 * @param {Object[]} codeRows    - Rows from Code Audit checklist
 * @param {Object[]} browserRows - Rows from Browser Audit checklist
 * @param {Object[]} manualRows  - Rows from Manual Checklist
 * @param {Object}   metadata    - { projectName, appUrl, repoUrl, auditorName, auditDate, auditVersion, projectType, projectManager, architectLead, currentPhase }
 * @returns {Record<string, string>} Flat key-value object matching Metrics.csv keys
 */
export function computeAllMetrics(codeRows, browserRows, manualRows, metadata = {}) {
  // Strip BOM (\uFEFF) from column keys — CSVs from Excel/Sheets often have this
  const stripBom = (rows) => rows.map((row) => {
    const clean = {};
    for (const [k, v] of Object.entries(row)) {
      clean[k.replace(/^\uFEFF/, '')] = v;
    }
    return clean;
  });
  codeRows = stripBom(codeRows);
  browserRows = stripBom(browserRows);
  manualRows = stripBom(manualRows);

  const m = {};

  // Metadata
  m['metadata.projectName'] = metadata.projectName || '';
  m['metadata.repoUrl'] = metadata.repoUrl || '';
  m['metadata.appUrl'] = metadata.appUrl || '';
  m['metadata.auditDate'] = metadata.auditDate || new Date().toISOString().split('T')[0];
  m['metadata.auditorName'] = metadata.auditorName || '';
  m['metadata.auditVersion'] = metadata.auditVersion || '2.0.0';
  m['metadata.projectType'] = metadata.projectType || '';
  m['metadata.projectManager'] = metadata.projectManager || '';
  m['metadata.architectLead'] = metadata.architectLead || '';
  m['metadata.currentPhase'] = metadata.currentPhase || '';

  // Summary counts
  Object.assign(m, computeSummary(codeRows, browserRows, manualRows));

  // Domain scores
  const domainScores = computeDomainScores(codeRows, browserRows, manualRows);
  for (const [domain, score] of Object.entries(domainScores)) {
    m[`scores.${domain}`] = score !== '' ? String(score) : '';
  }

  // Overall weighted score
  const overallScore = computeOverallScore(domainScores);
  m['scores.overall'] = overallScore !== '' ? String(overallScore) : '';

  // Risk index
  Object.assign(m, computeRisk(domainScores));

  // Status
  Object.assign(m, computeStatus(overallScore, codeRows, browserRows, manualRows));

  // Trend
  Object.assign(m, computeTrend(overallScore, domainScores, codeRows, browserRows, manualRows));

  // Top issues
  Object.assign(m, computeTopIssues(codeRows, browserRows, manualRows));

  // Components requiring attention
  Object.assign(m, computeComponents(codeRows, browserRows));

  // Granular per-item metrics
  Object.assign(m, computeGranularMetrics(codeRows, browserRows, manualRows));

  return m;
}
