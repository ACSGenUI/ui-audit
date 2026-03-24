(function (global) {
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
    },
    es: {
      "page.title": "Auditoría de producto — Informe de ejemplo",
      "theme.toggleTitle": "Cambiar tema. Alt+clic: usar el del sistema",
      "theme.ariaLight": "Cambiar a modo claro",
      "theme.ariaDark": "Cambiar a modo oscuro",
      "defaults.projectReport": "Informe de auditoría del proyecto de ejemplo",
      "defaults.sectionTitle": "Cumplimiento general",
      "defaults.checklistSummary": "1.240 elementos de lista total",
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
      var q = new URLSearchParams(global.location.search);
      return q.get("lang") || q.get("locale");
    } catch (queryError) {
      return null;
    }
  }

  function readLocaleFromStorage() {
    try {
      return global.localStorage.getItem(STORAGE_KEY);
    } catch (storageError) {
      return null;
    }
  }

  function resolveInitialLocale() {
    var fromQuery = readLocaleFromQuery();
    if (fromQuery) return normalizeLocale(fromQuery);
    var fromStorage = readLocaleFromStorage();
    if (fromStorage) return normalizeLocale(fromStorage);
    var nav =
      (global.navigator && (global.navigator.language || global.navigator.userLanguage)) || "";
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
        global.localStorage.setItem(STORAGE_KEY, currentLocale);
      } catch (persistError) {
        /* ignore */
      }
    }
    try {
      global.document.documentElement.lang = currentLocale;
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
    global.document.documentElement.lang = currentLocale;
  } catch (e) {
    /* ignore */
  }

  global.AuditDashboardI18n = {
    t: t,
    setLocale: setLocale,
    getLocale: getLocale,
    numberLocaleTag: numberLocaleTag,
    supportedLocales: supportedLocales,
    MESSAGES: MESSAGES,
  };
})(typeof window !== "undefined" ? window : globalThis);
