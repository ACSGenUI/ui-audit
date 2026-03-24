const g = globalThis;

var STORAGE_KEY = "ui-audit-locale";
var DEFAULT_LOCALE = "en";

  var MESSAGES = {
    en: {
      "page.title": "Product Audit — Example Project Report",
      "theme.toggleTitle": "Switch theme. Alt+click: use system setting",
      "theme.ariaLight": "Switch to light mode",
      "theme.ariaDark": "Switch to dark mode",
      "defaults.projectReport": "Example Project Audit Report",
      "defaults.sectionTitle": "Overall Compliance",
      "defaults.checklistSummary": "1,240 Total Checklist",
      "defaults.checklistTotalSuffix": "Total Checklist",
      "defaults.totalComplianceLabel": "Total compliance",
      "donut.ariaLabel": "Compliance breakdown by domain",
      "donut.overall": "Overall",
      "domain.openDetails": "{name}, open details",
      "domain.fallbackName": "Audit domain",
      "domain.passedTotalHint": "passed / total",
      "domain.rowProgressAria": "{passed} of {total} checklist items passed",
      "domain.ui-quality.title": "UI Quality",
      "domain.ui-quality.subtitle": "Visual design, consistency",
      "domain.accessibility.title": "Accessibility",
      "domain.accessibility.subtitle": "WCAG, keyboard, assistive tech",
      "domain.performance.title": "Performance",
      "domain.performance.subtitle": "Load, runtime, assets",
      "domain.code-quality.title": "Code Quality",
      "domain.code-quality.subtitle": "Structure, linting, patterns",
      "domain.ux-compliance.title": "UX Compliance",
      "domain.ux-compliance.subtitle": "Flows, heuristics, standards",
      "domain.security.title": "Security",
      "domain.security.subtitle": "Headers, policies, data handling",
      "nav.back": "Back",
      "nav.backAria": "Back to overview",
      "table.metric": "Metric",
      "table.compliance": "Compliance",
      "table.score": "Score",
      "drill.noMetrics": "No metrics",
      "drill.noDetailedMetricsForDomain": "No detailed metrics for this domain.",
      "compliance.yes": "Yes",
      "compliance.partial": "Partial",
      "compliance.no": "No",
      "drill.designSystemAdherence": "Design system adherence",
      "drill.componentConsistency": "Component consistency",
      "drill.spacingTypography": "Spacing & typography scale",
      "drill.brandGuideline": "Brand guideline coverage",
      "drill.wcagCritical": "WCAG 2.1 AA critical paths",
      "drill.keyboardOperability": "Keyboard operability",
      "drill.screenReaderLabels": "Screen reader labels",
      "drill.colorContrast": "Color contrast (UI)",
      "drill.lcp": "LCP (Largest Contentful Paint)",
      "drill.cls": "CLS (Cumulative Layout Shift)",
      "drill.bundleBudget": "Bundle size budget",
      "drill.imageOptimization": "Image optimization",
      "drill.lintTypecheck": "Lint / typecheck clean",
      "drill.testCoverage": "Test coverage (critical)",
      "drill.dependencyHygiene": "Dependency hygiene",
      "drill.deadCodeComplexity": "Dead code & complexity",
      "drill.errorRecovery": "Error recovery flows",
      "drill.formValidationUx": "Form validation UX",
      "drill.heuristicEval": "Heuristic evaluation",
      "drill.helpDocs": "Help & documentation links",
      "drill.cspHeaders": "CSP & security headers",
      "drill.secretScanning": "Secret scanning",
      "drill.depVulnerabilities": "Dependency vulnerabilities",
      "drill.authSession": "Auth session handling",
      "audit.titlePrefix": "UI Audit",
      "audit.commitLabel": "Commit",
      "audit.generatedLabel": "Generated",
      "audit.ragBadge": "RAG: {rating}",
      "audit.goLiveBadge": "Go-live: {answer}",
      "pdf.download": "Download PDF",
      "pdf.downloadAria": "Download audit report as PDF",
      "pdf.preparing": "Preparing PDF…",
      "pdf.error": "PDF export failed. Try again.",
      "footer.aiDisclaimer":
        "NOTE: This is an AI-driven experience, and while we strive for accuracy, AI may sometimes generate unexpected or imperfect responses.",
      "insights.checklistSummary": "Checklist summary",
      "insights.passRates": "Pass rates",
      "insights.col.value": "Value",
      "insights.col.pct": "%",
      "insights.row.totalChecks": "Total checks",
      "insights.row.passed": "Passed",
      "insights.row.failed": "Failed",
      "insights.row.notApplicable": "Not applicable",
      "insights.row.criticalFailed": "Critical failed",
      "insights.row.highFailed": "High failed",
      "insights.row.mediumFailed": "Medium failed",
      "insights.row.mandatoryFailed": "Mandatory failed",
      "insights.row.mandatoryPassRate": "Mandatory pass rate",
      "insights.row.criticalPassRate": "Critical pass rate",
      "metrics.categoriesAria": "Metrics grouped by category",
      "metrics.openCategory": "{name}, open details",
      "metrics.valueColumn": "Value",
      "metrics.uncategorized": "Uncategorized",
      "metrics.summary.browserAuditTitle": "Browser Audit",
      "metrics.summary.codeAuditTitle": "Code Audit",
      "metrics.summary.manualAuditTitle": "Manual Audit",
      "metrics.summary.checklistDistribution": "Checklist distribution",
      "metrics.summary.passRateHint": "Pass rate",
      "metrics.summary.pctLegend": "{n} %",
      "metrics.summary.otherSlice": "Other",
      "metrics.topIssues.tableTitle": "Top Issues",
      "metrics.topIssues.phase": "Phase",
      "metrics.topIssues.description": "Description",
      "metrics.topIssues.severity": "Severity",
      "metrics.topIssues.evidence": "Evidence",
      "metrics.topIssues.id": "ID",
      "metrics.topIssues.location": "Location",
      "metrics.topIssues.category": "Category",
      "metrics.topIssues.lineHint": "Line",
      "metrics.topIssues.lineNumber": "Line {n}",
      "metrics.components.tableTitle": "Component Category",
      "metrics.components.component": "Component",
      "metrics.components.failedChecks": "Failed Checks",
      "metrics.components.criticalFailures": "Critical Failures",
      "metrics.components.health": "Health",
      "metrics.components.name": "Name",
      "metrics.components.path": "Path",
      "metrics.components.critical": "Critical",
      "metrics.components.healthScore": "Health Score",
    },
    es: {
      "page.title": "Auditoría de producto — Informe de ejemplo",
      "theme.toggleTitle": "Cambiar tema. Alt+clic: usar el del sistema",
      "theme.ariaLight": "Cambiar a modo claro",
      "theme.ariaDark": "Cambiar a modo oscuro",
      "defaults.projectReport": "Informe de auditoría del proyecto de ejemplo",
      "defaults.sectionTitle": "Cumplimiento general",
      "defaults.checklistSummary": "1.240 elementos de lista total",
      "defaults.checklistTotalSuffix": "elementos de lista en total",
      "defaults.totalComplianceLabel": "Cumplimiento total",
      "donut.ariaLabel": "Desglose de cumplimiento por dominio",
      "donut.overall": "General",
      "domain.openDetails": "{name}, abrir detalles",
      "domain.fallbackName": "Dominio de auditoría",
      "domain.passedTotalHint": "superados / total",
      "domain.rowProgressAria": "{passed} de {total} elementos de lista superados",
      "domain.ui-quality.title": "Calidad de UI",
      "domain.ui-quality.subtitle": "Diseño visual, coherencia",
      "domain.accessibility.title": "Accesibilidad",
      "domain.accessibility.subtitle": "WCAG, teclado, tecnología de apoyo",
      "domain.performance.title": "Rendimiento",
      "domain.performance.subtitle": "Carga, tiempo de ejecución, recursos",
      "domain.code-quality.title": "Calidad del código",
      "domain.code-quality.subtitle": "Estructura, lint, patrones",
      "domain.ux-compliance.title": "Cumplimiento UX",
      "domain.ux-compliance.subtitle": "Flujos, heurísticas, estándares",
      "domain.security.title": "Seguridad",
      "domain.security.subtitle": "Cabeceras, políticas, datos",
      "nav.back": "Volver",
      "nav.backAria": "Volver a la vista general",
      "table.metric": "Métrica",
      "table.compliance": "Cumplimiento",
      "table.score": "Puntuación",
      "drill.noMetrics": "Sin métricas",
      "drill.noDetailedMetricsForDomain": "No hay métricas detalladas para este dominio.",
      "compliance.yes": "Sí",
      "compliance.partial": "Parcial",
      "compliance.no": "No",
      "drill.designSystemAdherence": "Adherencia al sistema de diseño",
      "drill.componentConsistency": "Coherencia de componentes",
      "drill.spacingTypography": "Escala de espaciado y tipografía",
      "drill.brandGuideline": "Cobertura de guía de marca",
      "drill.wcagCritical": "Rutas críticas WCAG 2.1 AA",
      "drill.keyboardOperability": "Operabilidad por teclado",
      "drill.screenReaderLabels": "Etiquetas para lectores de pantalla",
      "drill.colorContrast": "Contraste de color (UI)",
      "drill.lcp": "LCP (Largest Contentful Paint)",
      "drill.cls": "CLS (Cumulative Layout Shift)",
      "drill.bundleBudget": "Presupuesto del bundle",
      "drill.imageOptimization": "Optimización de imágenes",
      "drill.lintTypecheck": "Lint / comprobación de tipos limpia",
      "drill.testCoverage": "Cobertura de pruebas (crítica)",
      "drill.dependencyHygiene": "Higiene de dependencias",
      "drill.deadCodeComplexity": "Código muerto y complejidad",
      "drill.errorRecovery": "Flujos de recuperación de errores",
      "drill.formValidationUx": "UX de validación de formularios",
      "drill.heuristicEval": "Evaluación heurística",
      "drill.helpDocs": "Ayuda y enlaces a documentación",
      "drill.cspHeaders": "CSP y cabeceras de seguridad",
      "drill.secretScanning": "Escaneo de secretos",
      "drill.depVulnerabilities": "Vulnerabilidades en dependencias",
      "drill.authSession": "Gestión de sesión de autenticación",
      "audit.titlePrefix": "Auditoría UI",
      "audit.commitLabel": "Commit",
      "audit.generatedLabel": "Generado",
      "audit.ragBadge": "RAG: {rating}",
      "audit.goLiveBadge": "Puesta en vivo: {answer}",
      "pdf.download": "Descargar PDF",
      "pdf.downloadAria": "Descargar informe de auditoría en PDF",
      "pdf.preparing": "Preparando PDF…",
      "pdf.error": "Error al exportar PDF. Inténtelo de nuevo.",
      "footer.aiDisclaimer":
        "NOTA: Esta es una experiencia impulsada por IA y, aunque buscamos precisión, la IA a veces puede generar respuestas inesperadas o imperfectas.",
      "insights.checklistSummary": "Resumen de lista de comprobación",
      "insights.passRates": "Tasas de aprobación",
      "insights.col.value": "Valor",
      "insights.col.pct": "%",
      "insights.row.totalChecks": "Comprobaciones totales",
      "insights.row.passed": "Superadas",
      "insights.row.failed": "Fallidas",
      "insights.row.notApplicable": "No aplicable",
      "insights.row.criticalFailed": "Fallidas críticas",
      "insights.row.highFailed": "Fallidas altas",
      "insights.row.mediumFailed": "Fallidas medias",
      "insights.row.mandatoryFailed": "Fallidas obligatorias",
      "insights.row.mandatoryPassRate": "Tasa de aprobación obligatoria",
      "insights.row.criticalPassRate": "Tasa de aprobación crítica",
      "metrics.categoriesAria": "Métricas agrupadas por categoría",
      "metrics.openCategory": "{name}, abrir detalles",
      "metrics.valueColumn": "Valor",
      "metrics.uncategorized": "Sin categoría",
      "metrics.summary.browserAuditTitle": "Auditoría de navegador",
      "metrics.summary.codeAuditTitle": "Auditoría de código",
      "metrics.summary.manualAuditTitle": "Auditoría manual",
      "metrics.summary.checklistDistribution": "Distribución de la lista",
      "metrics.summary.passRateHint": "Tasa de aprobación",
      "metrics.summary.pctLegend": "{n} %",
      "metrics.summary.otherSlice": "Otro",
      "metrics.topIssues.tableTitle": "Problemas principales",
      "metrics.topIssues.phase": "Fase",
      "metrics.topIssues.description": "Descripción",
      "metrics.topIssues.severity": "Gravedad",
      "metrics.topIssues.evidence": "Evidencia",
      "metrics.topIssues.id": "ID",
      "metrics.topIssues.location": "Ubicación",
      "metrics.topIssues.category": "Categoría",
      "metrics.topIssues.lineHint": "Línea",
      "metrics.topIssues.lineNumber": "Línea {n}",
      "metrics.components.tableTitle": "Categoría de componentes",
      "metrics.components.component": "Componente",
      "metrics.components.failedChecks": "Comprobaciones fallidas",
      "metrics.components.criticalFailures": "Fallos críticos",
      "metrics.components.health": "Salud",
      "metrics.components.name": "Nombre",
      "metrics.components.path": "Ruta",
      "metrics.components.critical": "Críticos",
      "metrics.components.healthScore": "Puntuación de salud",
    },
  };

  function supportedLocales() {
    return Object.keys(MESSAGES);
  }

  function normalizeLocale(tag) {
    if (!tag || typeof tag !== "string") return DEFAULT_LOCALE;
    var trimmed = tag.trim();
    if (MESSAGES[trimmed]) return trimmed;
    var base = trimmed.split(/[-_]/)[0].toLowerCase();
    return MESSAGES[base] ? base : DEFAULT_LOCALE;
  }

  var currentLocale = DEFAULT_LOCALE;

  function readLocaleFromQuery() {
    try {
      var q = new URLSearchParams(g.location.search);
      return q.get("lang") || q.get("locale");
    } catch (queryError) {
      return null;
    }
  }

  function readLocaleFromStorage() {
    try {
      return g.localStorage.getItem(STORAGE_KEY);
    } catch (storageError) {
      return null;
    }
  }

  function resolveInitialLocale() {
    var fromQuery = readLocaleFromQuery();
    if (fromQuery) return normalizeLocale(fromQuery);
    var fromStorage = readLocaleFromStorage();
    if (fromStorage) return normalizeLocale(fromStorage);
    var nav = (g.navigator && (g.navigator.language || g.navigator.userLanguage)) || "";
    return normalizeLocale(String(nav));
  }

  currentLocale = resolveInitialLocale();

  function t(key, vars) {
    var map = MESSAGES[currentLocale] || MESSAGES[DEFAULT_LOCALE];
    var fallback = MESSAGES[DEFAULT_LOCALE];
    var str = (map && map[key]) || (fallback && fallback[key]) || key;
    if (vars && typeof vars === "object") {
      Object.keys(vars).forEach(function (k) {
        str = str.split("{" + k + "}").join(String(vars[k]));
      });
    }
    return str;
  }

  function setLocale(localeTag, persist) {
    currentLocale = normalizeLocale(localeTag);
    if (persist === true) {
      try {
        g.localStorage.setItem(STORAGE_KEY, currentLocale);
      } catch (persistError) {
        /* ignore */
      }
    }
    try {
      g.document.documentElement.lang = currentLocale;
    } catch (langError) {
      /* ignore */
    }
  }

  function getLocale() {
    return currentLocale;
  }

  function numberLocaleTag() {
    return currentLocale === "es" ? "es" : "en-US";
  }

try {
  g.document.documentElement.lang = currentLocale;
} catch (e) {
  /* ignore */
}

const AuditDashboardI18n = {
  t: t,
  setLocale: setLocale,
  getLocale: getLocale,
  numberLocaleTag: numberLocaleTag,
  supportedLocales: supportedLocales,
  MESSAGES: MESSAGES,
};
g.AuditDashboardI18n = AuditDashboardI18n;

export default AuditDashboardI18n;
export { t, setLocale, getLocale, numberLocaleTag, supportedLocales, MESSAGES };
