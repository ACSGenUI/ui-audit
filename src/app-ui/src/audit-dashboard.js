/**
 * Audit dashboard application: loads payloads, parses metrics, builds view models, and delegates
 * rendering to ProgenCraft.views.metrics (framework → ProgenCraftDesignSystem layouts + charts).
 */
import { ProgenCraftDesignSystem as DS } from '../../progen-craft/design-system/progen-craft-design-system.js';
import { ProgenCraft as PC } from '../../progen-craft/framework/progen-craft-framework.js';
import {
  buildMetricsCategoryViewModel,
  formatPercentLabel,
} from './audit-dashboard-metrics-view.js';

export const THEME_STORAGE_KEY = "ui-audit-theme";
  var pdfExportControlMounted = false;

  function t(key, vars) {
    var I = window.AuditDashboardI18n;
    if (I && typeof I.t === "function") return I.t(key, vars);
    return key;
  }

  function numberLocaleTag() {
    var I = window.AuditDashboardI18n;
    if (I && typeof I.numberLocaleTag === "function") return I.numberLocaleTag();
    return "en-US";
  }

  function resolveHtml2PdfScriptUrl() {
    if (typeof globalThis.__HTML2PDF_LIB_URI__ === "string" && globalThis.__HTML2PDF_LIB_URI__.length) {
      return globalThis.__HTML2PDF_LIB_URI__;
    }
    var dash = document.getElementById("dashboard");
    var rel = dash && dash.getAttribute("data-html2pdf-src");
    if (rel) {
      try {
        return new URL(rel, window.location.href).href;
      } catch (pdfUrlError) {
        return rel;
      }
    }
    return "../../progen-craft/design-system/utils/html2pdf.bundle.min.js";
  }

  function getPdfFilenameBase() {
    var p = globalThis.__UI_AUDIT_DASHBOARD__;
    if (p && p.metrics && p.metrics["metadata.projectName"] != null) {
      var mk = String(p.metrics["metadata.projectName"]).trim();
      if (mk) return mk;
    }
    if (p && p.projectName != null) {
      var pn = String(p.projectName).trim();
      if (pn) return pn;
    }
    var titleEl = document.getElementById("dash-audit-title");
    if (titleEl && titleEl.textContent) {
      var tx = titleEl.textContent.trim();
      if (tx) return tx;
    }
    return "Audit_Report";
  }

  function initPdfExportControl() {
    if (pdfExportControlMounted) return;
    var mount = document.getElementById("dash-pdf-download-root");
    if (!mount || !DS || !DS.widgets || typeof DS.widgets.createPdfDownloadControl !== "function") return;
    var usePrintForPdf = globalThis.__AUDIT_USE_PRINT_FOR_PDF__ === true;
    DS.widgets.createPdfDownloadControl(mount, {
      scriptUrl: usePrintForPdf ? "" : resolveHtml2PdfScriptUrl(),
      targetSelector: "#dashboard",
      getFilenameBase: getPdfFilenameBase,
      t: t,
      printFallback: usePrintForPdf,
    });
    pdfExportControlMounted = true;
  }

  function formatMetricValue(v) {
    if (v === undefined || v === null) return "—";
    if (typeof v === "number" && isFinite(v)) {
      return Math.abs(v % 1) < 1e-9 ? String(v) : String(Math.round(v * 1000) / 1000);
    }
    var s = String(v);
    if (s === "") return "—";
    var n = Number(s);
    if (isFinite(n) && s.trim() !== "" && /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(s.trim())) {
      return Math.abs(n % 1) < 1e-9 ? n.toLocaleString(numberLocaleTag()) : String(n);
    }
    return s;
  }

  function applyStaticDomI18n(options) {
    var skipDomainRows = options && options.skipDomainRows;
    if (!window.AuditDashboardI18n) return;
    var tr = window.AuditDashboardI18n.t.bind(window.AuditDashboardI18n);
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (!key) return;
      var text = tr(key);
      if (el.tagName === "TITLE") {
        document.title = text;
      } else {
        el.textContent = text;
      }
    });
    document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      var titleKey = el.getAttribute("data-i18n-title");
      if (titleKey) el.setAttribute("title", tr(titleKey));
    });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      var ariaKey = el.getAttribute("data-i18n-aria");
      if (ariaKey) el.setAttribute("aria-label", tr(ariaKey));
    });
    if (!skipDomainRows && DS && DS.widgets) {
      document.querySelectorAll("#dash-domains .row").forEach(function (row) {
        var domainKey = row.getAttribute("data-key");
        if (!domainKey) return;
        var titleKey = "domain." + domainKey + ".title";
        var subKey = "domain." + domainKey + ".subtitle";
        var titleEl = row.querySelector(".row-title");
        var subEl = row.querySelector(".row-sub");
        if (titleEl) titleEl.textContent = tr(titleKey);
        if (subEl) subEl.textContent = tr(subKey);
        row.setAttribute("aria-label", tr("domain.openDetails", { name: tr(titleKey) }));
        var dp = row.getAttribute("data-passed");
        var dt = row.getAttribute("data-total");
        if (dp != null && dt != null) {
          DS.widgets.syncRowProgressUi(row, parseInt(dp, 10), parseInt(dt, 10), {
            t: tr,
            numberLocaleTag: numberLocaleTag,
          });
        } else {
          var ve = row.querySelector(".row-value");
          var syn = DS.score.resolvePassedTotal({ value: ve ? ve.textContent : 0 });
          DS.widgets.syncRowProgressUi(row, syn.passed, syn.total, {
            t: tr,
            numberLocaleTag: numberLocaleTag,
          });
          row.setAttribute("data-passed", String(syn.passed));
          row.setAttribute("data-total", String(syn.total));
        }
      });
    }
  }

  function getSystemDark() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function getEffectiveTheme() {
    var attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") return attr;
    return getSystemDark() ? "dark" : "light";
  }

  function updateThemeToggleUI() {
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;
    var eff = getEffectiveTheme();
    var moon = btn.querySelector(".theme-toggle__icon--moon");
    var sun = btn.querySelector(".theme-toggle__icon--sun");
    if (moon) moon.classList.toggle("is-visible", eff === "light");
    if (sun) sun.classList.toggle("is-visible", eff === "dark");
    btn.setAttribute("aria-label", eff === "dark" ? t("theme.ariaLight") : t("theme.ariaDark"));
  }

  function initThemeToggle() {
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;
    updateThemeToggleUI();
    btn.addEventListener("click", function (event) {
      if (event.altKey) {
        event.preventDefault();
        localStorage.removeItem(THEME_STORAGE_KEY);
        document.documentElement.removeAttribute("data-theme");
        if (typeof globalThis.__AUDIT_AFTER_THEME_RESET__ === "function") {
          globalThis.__AUDIT_AFTER_THEME_RESET__();
        }
        updateThemeToggleUI();
        try {
          reinitDonutFromPayload();
        } catch (clearThemeDonutError) { /* donut may not exist yet */ }
        return;
      }
      var next = getEffectiveTheme() === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_STORAGE_KEY, next);
      document.documentElement.setAttribute("data-theme", next);
      updateThemeToggleUI();
      try {
        reinitDonutFromPayload();
      } catch (toggleThemeDonutError) { /* ignore */ }
    });
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
      if (!localStorage.getItem(THEME_STORAGE_KEY)) {
        updateThemeToggleUI();
        try {
          reinitDonutFromPayload();
        } catch (systemThemeDonutError) { /* ignore */ }
      }
    });
  }

  var ROW_COLORS_HEX = ["#e9d5ff", "#d9f99d", "#a5f3fc", "#fde68a", "#fbcfe8", "#e2e8f0"];

  function getDefaultDrilldown() {
    return {
      "ui-quality": [
        { metric: t("drill.designSystemAdherence"), compliance: t("compliance.yes"), score: 92 },
        { metric: t("drill.componentConsistency"), compliance: t("compliance.partial"), score: 68 },
        { metric: t("drill.spacingTypography"), compliance: t("compliance.yes"), score: 85 },
        { metric: t("drill.brandGuideline"), compliance: t("compliance.no"), score: 35 },
      ],
      accessibility: [
        { metric: t("drill.wcagCritical"), compliance: t("compliance.partial"), score: 72 },
        { metric: t("drill.keyboardOperability"), compliance: t("compliance.yes"), score: 88 },
        { metric: t("drill.screenReaderLabels"), compliance: t("compliance.yes"), score: 91 },
        { metric: t("drill.colorContrast"), compliance: t("compliance.no"), score: 38 },
      ],
      performance: [
        { metric: t("drill.lcp"), compliance: t("compliance.partial"), score: 55 },
        { metric: t("drill.cls"), compliance: t("compliance.yes"), score: 94 },
        { metric: t("drill.bundleBudget"), compliance: t("compliance.no"), score: 32 },
        { metric: t("drill.imageOptimization"), compliance: t("compliance.yes"), score: 82 },
      ],
      "code-quality": [
        { metric: t("drill.lintTypecheck"), compliance: t("compliance.yes"), score: 90 },
        { metric: t("drill.testCoverage"), compliance: t("compliance.partial"), score: 62 },
        { metric: t("drill.dependencyHygiene"), compliance: t("compliance.yes"), score: 95 },
        { metric: t("drill.deadCodeComplexity"), compliance: t("compliance.partial"), score: 48 },
      ],
      "ux-compliance": [
        { metric: t("drill.errorRecovery"), compliance: t("compliance.yes"), score: 86 },
        { metric: t("drill.formValidationUx"), compliance: t("compliance.partial"), score: 58 },
        { metric: t("drill.heuristicEval"), compliance: t("compliance.partial"), score: 71 },
        { metric: t("drill.helpDocs"), compliance: t("compliance.no"), score: 28 },
      ],
      security: [
        { metric: t("drill.cspHeaders"), compliance: t("compliance.yes"), score: 93 },
        { metric: t("drill.secretScanning"), compliance: t("compliance.yes"), score: 97 },
        { metric: t("drill.depVulnerabilities"), compliance: t("compliance.partial"), score: 76 },
        { metric: t("drill.authSession"), compliance: t("compliance.partial"), score: 44 },
      ],
    };
  }

  var drillMetricsByKey = {};

  function cloneDrillDefaults() {
    return JSON.parse(JSON.stringify(getDefaultDrilldown()));
  }

  function slugify(text) {
    return String(text || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  /** Injected or ?data= payload if any; otherwise sample metrics from AuditDashboardMetrics. */
  function getEffectivePayload() {
    var p = PC && PC.data && typeof PC.data.readPayload === "function" ? PC.data.readPayload() : null;
    if (p != null) return p;
    var M = window.AuditDashboardMetrics;
    if (!M || !M.DEFAULT_AUDIT_METRICS) return null;
    var name = String(M.DEFAULT_AUDIT_METRICS["metadata.projectName"] || "").trim();
    return {
      metrics: M.DEFAULT_AUDIT_METRICS,
      ...(name ? { projectName: name } : {}),
    };
  }

  function runOverviewRowBarAnimations(root) {
    if (!DS || !DS.motion) return;
    DS.motion.expandElementsBySelector(root, ".row-progress-fill", "row-progress-fill--expanded");
  }

  function readDomainsFromDom() {
    var rows = document.querySelectorAll("#dash-domains .row");
    return Array.prototype.map.call(rows, function (row, i) {
      var titleEl = row.querySelector(".row-title");
      var valEl = row.querySelector(".row-value");
      var box = row.querySelector(".icon-box");
      var v = valEl ? parseFloat(String(valEl.textContent).replace(/[^0-9.-]/g, "")) : 0;
      var color = ROW_COLORS_HEX[i % ROW_COLORS_HEX.length];
      if (box) {
        try {
          var bg = getComputedStyle(box).backgroundColor;
          if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") color = bg;
        } catch (computedStyleError) { /* ignore */ }
      }
      return {
        title: titleEl ? titleEl.textContent.trim() : "",
        value: isFinite(v) && v > 0 ? v : 1,
        color: color,
      };
    });
  }

  function averageDomainScore(domains) {
    if (!domains.length) return 0;
    var s = 0;
    for (var i = 0; i < domains.length; i++) s += domains[i].value;
    return Math.round(s / domains.length);
  }

  function prefersReducedMotionUi() {
    return DS && DS.motion ? DS.motion.prefersReducedMotion() : window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function animatePercentLabel(pctEl, targetPct, durationMs) {
    if (!pctEl || !isFinite(targetPct)) return;
    if (prefersReducedMotionUi()) {
      pctEl.textContent = Math.round(targetPct) + "%";
      return;
    }
    var start = performance.now();
    var from = 0;
    var end = Math.round(targetPct);
    function tick(now) {
      var t = Math.min(1, (now - start) / durationMs);
      var eased = 1 - Math.pow(1 - t, 2.35);
      pctEl.textContent = Math.round(from + (end - from) * eased) + "%";
      if (t < 1) requestAnimationFrame(tick);
      else pctEl.textContent = end + "%";
    }
    pctEl.textContent = "0%";
    requestAnimationFrame(tick);
  }

  function setDonutCenter(pctNum, label, labelColor, opts) {
    opts = opts || {};
    var pctEl = document.getElementById("dash-overview-pct");
    var labEl = document.getElementById("dash-center-label");
    if (!pctEl || !labEl) return;
    if (opts.animatePercent && isFinite(Number(pctNum))) {
      animatePercentLabel(pctEl, Number(pctNum), opts.percentDurationMs || 580);
    } else {
      pctEl.textContent = pctNum + "%";
    }
    labEl.textContent = label;
    labEl.style.color = labelColor || "";
  }

  function positionTooltip(tip, wrap, midAngle, rMid) {
    var cx = 50;
    var cy = 50;
    var mx = cx + rMid * Math.cos(midAngle);
    var my = cy + rMid * Math.sin(midAngle);
    var rect = wrap.getBoundingClientRect();
    var scale = rect.width / 100;
    var px = mx * scale;
    var py = my * scale;
    tip.style.left = px + "px";
    tip.style.top = py + "px";
    tip.style.transform = "translate(-50%, calc(-100% - 6px))";
  }

  var auditChartState = {
    overviewCenterPercent: 81,
    centerPctAnimated: false,
  };

  function resetDrillMetrics() {
    drillMetricsByKey = cloneDrillDefaults();
  }

  function mergePayloadDrillMetrics(auditPayload) {
    if (!auditPayload || !Array.isArray(auditPayload.domains)) return;
    auditPayload.domains.forEach(function (domain, domainIndex) {
      var key = domain.domainKey || slugify(domain.title) || "domain-" + domainIndex;
      if (domain.metrics && domain.metrics.length) {
        drillMetricsByKey[key] = domain.metrics.map(function (metric) {
          return {
            metric: metric.metric != null ? String(metric.metric) : "",
            compliance: metric.compliance != null ? String(metric.compliance) : "",
            score: metric.score,
          };
        });
      }
    });
  }

  function renderDrillTable(rows) {
    var tbody = document.getElementById("drill-tbody");
    if (!tbody || !DS || !DS.score) return;
    tbody.innerHTML = "";
    var list =
      rows && rows.length ? rows : [{ metric: t("drill.noMetrics"), compliance: "—", score: "" }];
    var barRuns = [];
    list.forEach(function (metricRow, rowIndex) {
      var tr = document.createElement("tr");
      tr.className = "metrics-row--animate";
      tr.style.setProperty("--metrics-row-delay", rowIndex * 42 + "ms");
      var tier = DS.score.tierClass(metricRow.score);
      var pct = DS.score.clampPct(Number(metricRow.score));
      var scoreDisp = isFinite(Number(metricRow.score)) ? Math.round(Number(metricRow.score)) + "%" : "—";
      tr.innerHTML =
        '<td class="td-metric"></td><td class="td-compliance"></td><td class="td-score"></td>';
      tr.querySelector(".td-metric").textContent = metricRow.metric || "";
      tr.querySelector(".td-compliance").textContent = metricRow.compliance || "";
      var tdScore = tr.querySelector(".td-score");
      var cell = document.createElement("div");
      cell.className = "score-cell " + tier;
      cell.innerHTML =
        '<span class="score-value"></span><div class="score-bar"><div class="score-bar-fill"></div></div>';
      cell.querySelector(".score-value").textContent = scoreDisp;
      var fill = cell.querySelector(".score-bar-fill");
      if (isFinite(Number(metricRow.score))) {
        fill.style.setProperty("--bar-target", pct + "%");
        if (prefersReducedMotionUi()) {
          fill.classList.add("score-bar-fill--expanded");
        } else {
          barRuns.push(fill);
        }
      } else {
        fill.style.setProperty("--bar-target", "0%");
        fill.classList.add("score-bar-fill--expanded");
      }
      tdScore.appendChild(cell);
      tbody.appendChild(tr);
    });
    if (barRuns.length) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          barRuns.forEach(function (fill) {
            fill.classList.add("score-bar-fill--expanded");
          });
        });
      });
    }
  }

  function showDrilldownPane() {
    var overview = document.getElementById("view-overview");
    var drill = document.getElementById("view-drilldown");
    if (!overview || !drill) return;
    overview.classList.add("is-hidden");
    overview.setAttribute("aria-hidden", "true");
    drill.classList.remove("is-hidden");
    drill.setAttribute("aria-hidden", "false");
  }

  function resetDrillTableHeaderForLegacy() {
    var tr = document.querySelector("#view-drilldown .metrics-table thead tr");
    if (!tr) return;
    tr.innerHTML =
      '<th scope="col" class="metrics-th metrics-th--metric"></th>' +
      '<th scope="col" class="metrics-th metrics-th--compliance"></th>' +
      '<th scope="col" class="metrics-th metrics-th--score"></th>';
    var ths = tr.querySelectorAll("th");
    if (ths[0]) ths[0].textContent = t("table.metric");
    if (ths[1]) ths[1].textContent = t("table.compliance");
    if (ths[2]) ths[2].textContent = t("table.score");
  }

  function showDrilldownView(domainKey, title) {
    var titleEl = document.getElementById("drill-title");
    if (!titleEl) return;
    var tbl = document.querySelector("#view-drilldown .metrics-table");
    if (tbl) tbl.classList.remove("metrics-table--kv");
    resetDrillTableHeaderForLegacy();
    var metrics = drillMetricsByKey[domainKey];
    if (!metrics || !metrics.length) {
      metrics = [{ metric: t("drill.noDetailedMetricsForDomain"), compliance: "—", score: "" }];
    }
    titleEl.textContent = title || domainKey;
    renderDrillTable(metrics);
    showDrilldownPane();
    var back = document.getElementById("drill-back");
    if (back) back.focus();
  }

  function showCategoryDrilldown(category) {
    var grouped = window.__METRICS_DRILL_GROUPS__;
    var M = window.AuditDashboardMetrics;
    if (!grouped || !grouped[category] || !M) return;
    var rows = grouped[category].filter(function (row) {
      return !(category === "overallStatus" && row.restPath === "ragRating");
    });
    var titleEl = document.getElementById("drill-title");
    if (!titleEl) return;
    var tbl = document.querySelector("#view-drilldown .metrics-table");
    if (tbl) tbl.classList.add("metrics-table--kv");
    var trHead = document.querySelector("#view-drilldown .metrics-table thead tr");
    if (trHead) {
      trHead.innerHTML =
        '<th scope="col" class="metrics-th metrics-th--metric"></th>' +
        '<th scope="col" class="metrics-th metrics-th--value-col"></th>';
      var ths = trHead.querySelectorAll("th");
      if (ths[0]) ths[0].textContent = t("table.metric");
      if (ths[1]) ths[1].textContent = t("metrics.valueColumn");
    }
    titleEl.textContent =
      category === "_root" ? t("metrics.uncategorized") : M.humanizeSegment(category);
    var tbody = document.getElementById("drill-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    rows.forEach(function (r, i) {
      var tr = document.createElement("tr");
      tr.className = "metrics-row--animate";
      tr.style.setProperty("--metrics-row-delay", i * 28 + "ms");
      var tdM = document.createElement("td");
      tdM.className = "td-metric";
      tdM.textContent = M.formatMetricRestPathLabel(r.restPath);
      var tdV = document.createElement("td");
      tdV.className = "td-compliance";
      tdV.textContent = formatMetricValue(r.value);
      tr.appendChild(tdM);
      tr.appendChild(tdV);
      tbody.appendChild(tr);
    });
    showDrilldownPane();
    var back = document.getElementById("drill-back");
    if (back) back.focus();
  }

  function showOverviewView() {
    var overview = document.getElementById("view-overview");
    var drill = document.getElementById("view-drilldown");
    if (!overview || !drill) return;
    var tbl = document.querySelector("#view-drilldown .metrics-table");
    if (tbl) tbl.classList.remove("metrics-table--kv");
    resetDrillTableHeaderForLegacy();
    drill.classList.add("is-hidden");
    drill.setAttribute("aria-hidden", "true");
    overview.classList.remove("is-hidden");
    overview.setAttribute("aria-hidden", "false");
  }

  function wireDrilldownHandlers() {
    var root = document.getElementById("dash-domains");
    var back = document.getElementById("drill-back");

    function activateRow(row) {
      var key = row.getAttribute("data-key");
      var titleEl = row.querySelector(".row-title");
      showDrilldownView(key, titleEl ? titleEl.textContent.trim() : key);
    }

    if (root) {
      root.addEventListener("click", function (event) {
        var row = event.target.closest(".row");
        if (!row || !root.contains(row)) return;
        activateRow(row);
      });

      root.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        var row = event.target.closest(".row");
        if (!row || !root.contains(row)) return;
        event.preventDefault();
        activateRow(row);
      });
    }

    var catRoot = document.getElementById("metric-categories-root");
    if (catRoot) {
      catRoot.addEventListener("click", function (event) {
        var card = event.target.closest("[data-category]");
        if (!card || !catRoot.contains(card)) return;
        var cat = card.getAttribute("data-category");
        if (cat) showCategoryDrilldown(cat);
      });
      catRoot.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        var card = event.target.closest("[data-category]");
        if (!card || !catRoot.contains(card)) return;
        event.preventDefault();
        var cat = card.getAttribute("data-category");
        if (cat) showCategoryDrilldown(cat);
      });
    }

    if (back) {
      back.addEventListener("click", function () {
        showOverviewView();
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      var drill = document.getElementById("view-drilldown");
      if (drill && !drill.classList.contains("is-hidden")) {
        event.preventDefault();
        showOverviewView();
      }
    });
  }

  function initComplianceDonut(overrideCenterPct, precomputedSlices) {
    var svg = document.getElementById("donut-svg");
    var tip = document.getElementById("donut-tooltip");
    var wrap = document.querySelector(".donut-wrap");
    if (!svg || !tip || !wrap || !DS || !DS.geometry) return;

    var usePre = precomputedSlices !== undefined && precomputedSlices !== null;
    var domainSlices = usePre ? precomputedSlices : readDomainsFromDom();

    if (!domainSlices.length) {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var onlyCenter =
        overrideCenterPct != null && isFinite(Number(overrideCenterPct))
          ? Math.round(Number(overrideCenterPct))
          : 0;
      auditChartState.overviewCenterPercent = onlyCenter;
      setDonutCenter(onlyCenter, t("donut.overall"), "var(--text-muted)", {
        animatePercent: !auditChartState.centerPctAnimated,
      });
      auditChartState.centerPctAnimated = true;
      return;
    }

    var sum = 0;
    for (var j = 0; j < domainSlices.length; j++) sum += domainSlices[j].value;
    if (sum <= 0) sum = domainSlices.length || 1;

    var parsedCenterOverride = overrideCenterPct != null ? Number(overrideCenterPct) : NaN;
    auditChartState.overviewCenterPercent = !isNaN(parsedCenterOverride)
      ? Math.round(parsedCenterOverride)
      : averageDomainScore(domainSlices);
    setDonutCenter(auditChartState.overviewCenterPercent, t("donut.overall"), "var(--text-muted)", {
      animatePercent: !auditChartState.centerPctAnimated,
    });
    auditChartState.centerPctAnimated = true;

    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var cx = 50;
    var cy = 50;
    var r0 = 29;
    var r1 = 42;
    var gapRad = (2 * Math.PI * 2) / 360;
    var n = domainSlices.length;
    var totalGaps = n * gapRad;
    var avail = Math.max(0.01, 2 * Math.PI - totalGaps);
    var angleCursor = -Math.PI / 2 + gapRad / 2;

    for (var i = 0; i < n; i++) {
      var frac = domainSlices[i].value / sum;
      var span = avail * frac;
      var a0 = angleCursor;
      var a1 = angleCursor + span;
      angleCursor = a1 + gapRad;

      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", DS.geometry.sectorPath(cx, cy, r0, r1, a0, a1));
      path.setAttribute("fill", domainSlices[i].color);
      path.setAttribute("class", "donut-seg donut-seg--animate-in");
      path.style.setProperty("--donut-enter-delay", DS.motion.prefersReducedMotion() ? "0ms" : i * 46 + "ms");
      path.dataset.title = domainSlices[i].title;
      path.dataset.value = String(Math.round(domainSlices[i].value));

      (function (slice, midA) {
        path.addEventListener("mouseenter", function () {
          tip.textContent = slice.title + ": " + Math.round(slice.value);
          tip.style.backgroundColor = slice.color;
          var tipStyle = DS.color.tooltipStyleForBackground(slice.color);
          tip.style.color = tipStyle.color;
          tip.style.textShadow = tipStyle.textShadow;
          tip.classList.add("is-visible");
          positionTooltip(tip, wrap, midA, (r0 + r1) / 2);
          setDonutCenter(Math.round(slice.value), slice.title, slice.color);
          path.classList.add("is-hover");
        });
        path.addEventListener("mouseleave", function () {
          tip.classList.remove("is-visible");
          tip.style.color = "";
          tip.style.textShadow = "";
          path.classList.remove("is-hover");
          setDonutCenter(auditChartState.overviewCenterPercent, t("donut.overall"), "var(--text-muted)");
        });
      })(domainSlices[i], (a0 + a1) / 2);

      svg.appendChild(path);
    }
  }

  function reinitDonutFromPayload() {
    var payload = getEffectivePayload();
    var M = window.AuditDashboardMetrics;
    var flat = M && payload ? M.getFlatMetricsFromPayload(payload) : null;
    var parsedOverviewCenter =
      payload && payload.overviewCenterPercent != null ? Number(payload.overviewCenterPercent) : NaN;
    auditChartState.centerPctAnimated = false;
    if (flat) {
      var built = M.buildDonutSlicesFromFlat(flat);
      var center = !isNaN(parsedOverviewCenter)
        ? parsedOverviewCenter
        : built.center != null
          ? Math.round(built.center)
          : NaN;
      initComplianceDonut(!isNaN(center) ? center : null, built.slices);
    } else {
      initComplianceDonut(!isNaN(parsedOverviewCenter) ? parsedOverviewCenter : null);
    }
  }

  function pickMetric(flat, key) {
    if (!flat || !Object.prototype.hasOwnProperty.call(flat, key)) return undefined;
    var v = flat[key];
    if (v === null || v === "") return undefined;
    return v;
  }

  function pickMetricFirst(flat, keys) {
    if (!flat || !keys || !keys.length) return undefined;
    for (var i = 0; i < keys.length; i++) {
      var v = pickMetric(flat, keys[i]);
      if (v !== undefined) return v;
    }
    return undefined;
  }

  function normalizeRagRating(s) {
    var u = String(s || "")
      .trim()
      .toLowerCase();
    if (u === "red") return "Red";
    if (u === "amber" || u === "yellow") return "Amber";
    if (u === "green") return "Green";
    return null;
  }

  function normalizeGoLiveReady(raw) {
    var u = String(raw == null ? "" : raw)
      .trim()
      .toLowerCase();
    if (u === "yes" || u === "y" || u === "true" || u === "1") return "Yes";
    if (u === "no" || u === "n" || u === "false" || u === "0") return "No";
    return null;
  }

  function syncDashStatusBadges(flat, auditBanner) {
    var banner = auditBanner && typeof auditBanner === "object" ? auditBanner : {};
    var goliveWrap = document.getElementById("dash-golive-wrap");
    var goliveBadge = document.getElementById("dash-golive-badge");
    var ragWrap = document.getElementById("dash-rag-wrap");
    var ragBadge = document.getElementById("dash-rag-badge");

    var goRaw = flat ? pickMetricFirst(flat, ["status.goLiveReady", "overallStatus.goLiveReady"]) : undefined;
    if (goRaw === undefined && banner.goLiveReady != null && String(banner.goLiveReady).trim() !== "") {
      goRaw = banner.goLiveReady;
    }
    var gl = normalizeGoLiveReady(goRaw);
    if (goliveWrap && goliveBadge) {
      if (gl === "Yes" || gl === "No") {
        goliveBadge.textContent = t("audit.goLiveBadge", { answer: gl === "Yes" ? "YES" : "NO" });
        goliveBadge.className = "audit-rag audit-rag--" + (gl === "Yes" ? "green" : "red");
        goliveBadge.setAttribute("aria-label", goliveBadge.textContent);
        goliveWrap.hidden = false;
      } else {
        goliveBadge.textContent = "";
        goliveBadge.className = "audit-rag";
        goliveWrap.removeAttribute("aria-label");
        goliveWrap.hidden = true;
      }
    }

    var ragRaw = flat ? pickMetricFirst(flat, ["overallStatus.ragRating", "status.ragRating"]) : undefined;
    if (ragRaw === undefined && banner.ragRating != null && String(banner.ragRating).trim() !== "") {
      ragRaw = banner.ragRating;
    }
    var rag = normalizeRagRating(ragRaw != null ? String(ragRaw) : "");
    if (ragWrap && ragBadge) {
      if (rag === "Red" || rag === "Amber" || rag === "Green") {
        ragBadge.textContent = t("audit.ragBadge", { rating: rag.toUpperCase() });
        ragBadge.className = "audit-rag audit-rag--" + rag.toLowerCase();
        ragBadge.setAttribute("aria-label", ragBadge.textContent);
        ragWrap.hidden = false;
      } else {
        ragBadge.textContent = "";
        ragBadge.className = "audit-rag";
        ragWrap.removeAttribute("aria-label");
        ragWrap.hidden = true;
      }
    }
  }

  function isAuditFieldEmpty(v) {
    return v == null || v === "";
  }

  function mergeFlatMetricsIntoAuditPayload(p) {
    if (!p || !p.metrics || typeof p.metrics !== "object" || Array.isArray(p.metrics)) return;
    var f = p.metrics;
    if (!p.auditBanner) p.auditBanner = {};
    var b = p.auditBanner;
    var v;
    if (isAuditFieldEmpty(b.repoUrl) && (v = pickMetric(f, "metadata.repoUrl")) != null) b.repoUrl = String(v);
    if (isAuditFieldEmpty(b.appUrl) && (v = pickMetric(f, "metadata.appUrl")) != null) b.appUrl = String(v);
    if (isAuditFieldEmpty(b.commitId) && (v = pickMetric(f, "metadata.commitId")) != null) b.commitId = String(v);
    if (isAuditFieldEmpty(b.auditTimestamp) && (v = pickMetricFirst(f, ["metadata.auditTimestamp", "metadata.auditDate"])) != null) {
      b.auditTimestamp = String(v);
    }
    if (isAuditFieldEmpty(b.ragRating) && (v = pickMetricFirst(f, ["overallStatus.ragRating", "status.ragRating"])) != null) {
      var normRag = normalizeRagRating(String(v));
      b.ragRating = normRag || String(v);
    }
    if (isAuditFieldEmpty(b.goLiveReady) && (v = pickMetricFirst(f, ["status.goLiveReady", "overallStatus.goLiveReady"])) != null) {
      var normGl = normalizeGoLiveReady(v);
      b.goLiveReady = normGl != null ? normGl : String(v);
    }
    if (!p.checklistSummaryMetrics) p.checklistSummaryMetrics = {};
    var c = p.checklistSummaryMetrics;
    if (isAuditFieldEmpty(c.totalChecks) && (v = pickMetricFirst(f, ["summary.overall.total", "summary.totalChecks"])) != null) {
      c.totalChecks = v;
    }
    if (isAuditFieldEmpty(c.passed) && (v = pickMetricFirst(f, ["summary.overall.passed", "summary.passed"])) != null) {
      c.passed = v;
    }
    if (isAuditFieldEmpty(c.failed) && (v = pickMetricFirst(f, ["summary.overall.failed", "summary.failed"])) != null) {
      c.failed = v;
    }
    if (isAuditFieldEmpty(c.notApplicable) && (v = pickMetricFirst(f, ["summary.overall.notApplicable", "summary.notApplicable"])) != null) {
      c.notApplicable = v;
    }
    if (isAuditFieldEmpty(c.criticalFailed) && (v = pickMetricFirst(f, ["summary.overall.criticalFailed", "summary.criticalFailed"])) != null) {
      c.criticalFailed = v;
    }
    if (isAuditFieldEmpty(c.highFailed) && (v = pickMetricFirst(f, ["summary.overall.highFailed", "summary.highFailed"])) != null) {
      c.highFailed = v;
    }
    if (isAuditFieldEmpty(c.mediumFailed) && (v = pickMetricFirst(f, ["summary.overall.mediumFailed", "summary.mediumFailed"])) != null) {
      c.mediumFailed = v;
    }
    if (isAuditFieldEmpty(c.mandatoryFailed) && (v = pickMetricFirst(f, ["summary.overall.mandatoryFailed", "summary.mandatoryFailed"])) != null) {
      c.mandatoryFailed = v;
    }
    if (!p.passRates) p.passRates = {};
    var pr = p.passRates;
    if (isAuditFieldEmpty(pr.mandatoryPassRate) && (v = pickMetricFirst(f, ["overallStatus.mandatoryPassRate", "status.mandatoryPassRate"])) != null) {
      pr.mandatoryPassRate = v;
    }
    if (isAuditFieldEmpty(pr.criticalPassRate) && (v = pickMetricFirst(f, ["overallStatus.criticalPassRate", "status.criticalPassRate"])) != null) {
      pr.criticalPassRate = v;
    }
    if (isAuditFieldEmpty(p.projectName) && pickMetric(f, "metadata.projectName") != null) {
      p.projectName = String(pickMetric(f, "metadata.projectName"));
    }
  }

  function scoreFromFlat(flat, key) {
    var v = pickMetric(flat, key);
    if (v === undefined || v === null || v === "") return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function scoreFromFlatFirst(flat, keys) {
    if (!keys || !keys.length) return null;
    for (var i = 0; i < keys.length; i++) {
      var n = scoreFromFlat(flat, keys[i]);
      if (n != null) return n;
    }
    return null;
  }

  function formatDomainScore(n) {
    if (n == null || !isFinite(n)) return "0";
    return Math.abs(n % 1) < 1e-9 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
  }

  function deriveEdsDomainsFromMetrics(p) {
    if (!p || !p.metrics || typeof p.metrics !== "object" || p.ignoreMetricsDomains === true) return;
    var f = p.metrics;
    if (pickMetric(f, "overallScores.uiQualityScore") == null && pickMetric(f, "scores.overall") == null) return;
    if (p.domains && p.domains.length > 0 && p.deriveDomainsFromMetrics !== true) return;

    function uxComplianceScore() {
      var direct = scoreFromFlatFirst(f, ["overallScores.uxComplianceScore", "scores.uxCompliance"]);
      if (direct != null) return direct;
      var h = scoreFromFlatFirst(f, ["overallScores.htmlScore", "scores.htmlImplementation"]);
      var c = scoreFromFlatFirst(f, ["overallScores.cssScore", "scores.cssImplementation"]);
      var j = scoreFromFlatFirst(f, ["overallScores.javascriptScore", "scores.javascriptImplementation"]);
      var parts = [];
      if (h != null) parts.push(h);
      if (c != null) parts.push(c);
      if (j != null) parts.push(j);
      if (!parts.length) return null;
      var sum = 0;
      for (var i = 0; i < parts.length; i++) sum += parts[i];
      return sum / parts.length;
    }

    var spec = [
      {
        domainKey: "ui-quality",
        titleKey: "domain.ui-quality.title",
        subKey: "domain.ui-quality.subtitle",
        scoreKeys: ["overallScores.uiQualityScore", "scores.overall"],
      },
      {
        domainKey: "accessibility",
        titleKey: "domain.accessibility.title",
        subKey: "domain.accessibility.subtitle",
        scoreKeys: ["overallScores.accessibilityScore", "scores.accessibility"],
      },
      {
        domainKey: "performance",
        titleKey: "domain.performance.title",
        subKey: "domain.performance.subtitle",
        scoreKeys: ["overallScores.performanceScore", "scores.performance"],
      },
      {
        domainKey: "code-quality",
        titleKey: "domain.code-quality.title",
        subKey: "domain.code-quality.subtitle",
        scoreKeys: ["overallScores.codeQualityScore", "scores.codeQuality"],
      },
      {
        domainKey: "ux-compliance",
        titleKey: "domain.ux-compliance.title",
        subKey: "domain.ux-compliance.subtitle",
        scoreFn: uxComplianceScore,
      },
      {
        domainKey: "security",
        titleKey: "domain.security.title",
        subKey: "domain.security.subtitle",
        scoreKeys: ["overallScores.securityScore", "scores.security"],
      },
    ];

    p.domains = spec.map(function (row) {
      var n =
        typeof row.scoreFn === "function" ? row.scoreFn() : scoreFromFlatFirst(f, row.scoreKeys || []);
      return {
        title: t(row.titleKey),
        subtitle: t(row.subKey),
        value: n != null ? formatDomainScore(n) : "0",
        domainKey: row.domainKey,
      };
    });
  }

  function deriveHeadlineFieldsFromMetrics(p) {
    if (!p || !p.metrics || typeof p.metrics !== "object" || p.ignoreMetricsDomains === true) return;
    var f = p.metrics;
    if (pickMetric(f, "overallScores.uiQualityScore") == null && pickMetric(f, "scores.overall") == null) return;
    if (p.preservePayloadHeadlines === true) return;

    var tc = pickMetricFirst(f, ["summary.overall.total", "summary.totalChecks"]);
    if (tc != null && isAuditFieldEmpty(p.checklistSummaryLine)) {
      var num = Number(tc);
      p.checklistSummaryLine =
        (isFinite(num) ? num.toLocaleString(numberLocaleTag()) : String(tc)) +
        " " +
        t("defaults.checklistTotalSuffix");
    }

    var uiq = scoreFromFlatFirst(f, ["overallScores.uiQualityScore", "scores.overall"]);
    if (uiq != null) {
      if (isAuditFieldEmpty(p.totalComplianceValue)) {
        p.totalComplianceValue = formatDomainScore(uiq);
      }
      if (
        p.overviewCenterPercent == null ||
        p.overviewCenterPercent === "" ||
        !isFinite(Number(p.overviewCenterPercent))
      ) {
        p.overviewCenterPercent = Math.round(uiq);
      }
    }
  }

  function shortCommitDisplay(id) {
    var s = String(id || "").trim();
    if (/^[a-f0-9]{7,40}$/i.test(s)) return s.length > 12 ? s.slice(0, 12) : s;
    return s;
  }

  function renderBannerFromFlatMetrics(flat, auditPayload) {
    var M = window.AuditDashboardMetrics;
    if (!M || !flat) return;
    var meta = M.getMetadataMap(flat);
    var prefix = t("audit.titlePrefix");
    var name =
      meta.projectName != null && String(meta.projectName).trim() !== ""
        ? String(meta.projectName).trim()
        : auditPayload && auditPayload.projectName != null && String(auditPayload.projectName).trim() !== ""
          ? String(auditPayload.projectName).trim()
          : t("defaults.projectReport");
    var fullTitle = name ? prefix + " — " + name : prefix;
    var titleEl = document.getElementById("dash-audit-title");
    var drillProj = document.getElementById("dash-drill-project-name");
    if (titleEl) titleEl.textContent = fullTitle;
    if (drillProj) drillProj.textContent = fullTitle;

    var metaRoot = document.getElementById("dash-audit-meta");
    if (metaRoot) {
      metaRoot.innerHTML = "";
      metaRoot.hidden = true;
      var hasMeta = false;
      if (meta.repoUrl) {
        hasMeta = true;
        var repo = document.createElement("div");
        repo.className = "audit-banner__repo";
        repo.textContent = String(meta.repoUrl);
        metaRoot.appendChild(repo);
      }
      if (meta.appUrl) {
        hasMeta = true;
        var link = document.createElement("a");
        link.className = "audit-banner__link";
        link.href = String(meta.appUrl);
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = String(meta.appUrl);
        metaRoot.appendChild(link);
      }
      if (meta.commitId || meta.auditTimestamp) {
        hasMeta = true;
        var line = document.createElement("div");
        line.className = "audit-banner__commit-line";
        var parts = [];
        if (meta.commitId) parts.push(t("audit.commitLabel") + " " + shortCommitDisplay(meta.commitId));
        if (meta.auditTimestamp) {
          parts.push(t("audit.generatedLabel") + " " + String(meta.auditTimestamp));
        }
        line.textContent = parts.join(" · ");
        metaRoot.appendChild(line);
      }
      var reserved = { projectName: 1, repoUrl: 1, appUrl: 1, commitId: 1, auditTimestamp: 1 };
      Object.keys(meta)
        .sort()
        .forEach(function (k) {
          if (reserved[k]) return;
          hasMeta = true;
          var extra = document.createElement("div");
          extra.className = "audit-banner__meta-extra";
          extra.textContent = M.humanizeSegment(k) + ": " + String(meta[k]);
          metaRoot.appendChild(extra);
        });
      metaRoot.hidden = !hasMeta;
    }

    syncDashStatusBadges(flat, auditPayload && auditPayload.auditBanner);
  }

  function renderMetricCategoryGrid(flat) {
    if (!PC || !PC.views || !PC.views.metrics) return;
    var M = window.AuditDashboardMetrics;
    var root = document.getElementById("metric-categories-root");
    if (!root || !flat || !M) return;
    var viewModel = buildMetricsCategoryViewModel(flat, {
      t: t,
      formatMetricValue: formatMetricValue,
      formatDomainScore: formatDomainScore,
      metrics: M,
    });
    PC.views.metrics.renderDashboardView(root, viewModel, {
      t: t,
      formatPercentLabel: formatPercentLabel,
      numberLocaleTag: numberLocaleTag,
    });
  }

  function applyMetricsModeDashboard(flat, auditPayload) {
    mergeFlatMetricsIntoAuditPayload(auditPayload);
    applyStaticDomI18n({ skipDomainRows: true });
    renderBannerFromFlatMetrics(flat, auditPayload);
    renderMetricCategoryGrid(flat);
    var checklistEl = document.getElementById("dash-checklist-summary");
    var tc = pickMetricFirst(flat, ["summary.overall.total", "summary.totalChecks"]);
    if (checklistEl && tc != null && tc !== undefined && String(tc).trim() !== "") {
      var num = Number(tc);
      checklistEl.textContent =
        (isFinite(num) ? num.toLocaleString(numberLocaleTag()) : String(tc)) +
        " " +
        t("defaults.checklistTotalSuffix");
    } else if (checklistEl && auditPayload && auditPayload.checklistSummaryLine != null) {
      checklistEl.textContent = auditPayload.checklistSummaryLine;
    }
    var totalEl = document.getElementById("dash-total-compliance");
    var uiq = pickMetricFirst(flat, ["scores.overall", "overallScores.uiQualityScore"]);
    if (totalEl && uiq != null && uiq !== "") {
      var u = Number(uiq);
      totalEl.textContent = isFinite(u) ? formatDomainScore(u) : String(uiq);
    } else if (totalEl && auditPayload && auditPayload.totalComplianceValue != null) {
      var tcn = Number(auditPayload.totalComplianceValue);
      totalEl.textContent = isNaN(tcn)
        ? String(auditPayload.totalComplianceValue)
        : tcn.toLocaleString(numberLocaleTag());
    }
    var domRoot = document.getElementById("dash-domains");
    if (domRoot) {
      domRoot.innerHTML = "";
      domRoot.hidden = true;
    }
    mergePayloadDrillMetrics(auditPayload);
  }

  function applyLegacyDashboard(auditPayload) {
    if (auditPayload) {
      mergeFlatMetricsIntoAuditPayload(auditPayload);
      deriveEdsDomainsFromMetrics(auditPayload);
      deriveHeadlineFieldsFromMetrics(auditPayload);
    }
    var payloadReplacesDomains =
      auditPayload && Array.isArray(auditPayload.domains) && auditPayload.domains.length > 0;
    applyStaticDomI18n({ skipDomainRows: !!payloadReplacesDomains });
    renderAuditBanner(auditPayload);
    var catRoot = document.getElementById("metric-categories-root");
    if (catRoot) catRoot.innerHTML = "";
    window.__METRICS_DRILL_GROUPS__ = null;
    var domRoot = document.getElementById("dash-domains");
    if (domRoot) domRoot.hidden = false;

    if (!auditPayload) {
      mergePayloadDrillMetrics(null);
      return;
    }

    if (auditPayload.checklistSummaryLine != null) {
      var checklistEl = document.getElementById("dash-checklist-summary");
      if (checklistEl) checklistEl.textContent = auditPayload.checklistSummaryLine;
    }
    if (auditPayload.totalComplianceValue != null) {
      var totalComplianceNumber = Number(auditPayload.totalComplianceValue);
      var totalEl = document.getElementById("dash-total-compliance");
      if (totalEl) {
        totalEl.textContent =
          isNaN(totalComplianceNumber)
            ? String(auditPayload.totalComplianceValue)
            : totalComplianceNumber.toLocaleString(numberLocaleTag());
      }
    }
    if (payloadReplacesDomains && domRoot && DS && DS.score && DS.widgets) {
      domRoot.innerHTML = "";
      var palette = [
        "var(--icon-row-1)",
        "var(--icon-row-2)",
        "var(--icon-row-3)",
        "var(--icon-row-4)",
        "var(--icon-row-5)",
        "var(--icon-row-6)",
      ];
      auditPayload.domains.forEach(function (domain, domainIndex) {
        var row = document.createElement("div");
        var domainKey = domain.domainKey || slugify(domain.title) || "domain-" + domainIndex;
        row.className = "row";
        row.setAttribute("data-key", domainKey);
        row.setAttribute("role", "listitem");
        row.setAttribute("tabindex", "0");
        var displayTitle = domain.title || t("domain.fallbackName");
        row.setAttribute("aria-label", t("domain.openDetails", { name: displayTitle }));
        row.innerHTML =
          '<div class="icon-box" style="background:' +
          (domain.iconBg || palette[domainIndex % palette.length]) +
          '">' +
          (domain.iconSvg || '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/></svg>') +
          '</div><div class="row-body"><div class="row-head"><div class="row-titles"><div class="row-title"></div><div class="row-sub"></div></div><div class="row-value"></div></div><div class="row-progress"><div class="row-progress-meta"><span class="row-passed-total"></span><span class="row-progress-hint"></span></div><div class="row-progress-bar"><div class="row-progress-fill"></div></div></div></div>';
        row.querySelector(".row-title").textContent = domain.title || "";
        row.querySelector(".row-sub").textContent = domain.subtitle || "";
        row.querySelector(".row-value").textContent = domain.value != null ? String(domain.value) : "";
        var counts = DS.score.resolvePassedTotal(domain);
        row.setAttribute("data-passed", String(counts.passed));
        row.setAttribute("data-total", String(counts.total));
        DS.widgets.syncRowProgressUi(row, counts.passed, counts.total, {
          t: t,
          numberLocaleTag: numberLocaleTag,
        });
        domRoot.appendChild(row);
      });
    }

    mergePayloadDrillMetrics(auditPayload);
  }

  function renderAuditBanner(auditPayload) {
    var banner = auditPayload && auditPayload.auditBanner ? auditPayload.auditBanner : {};
    var prefix =
      banner.titlePrefix != null && String(banner.titlePrefix).trim() !== ""
        ? String(banner.titlePrefix).trim()
        : t("audit.titlePrefix");
    var defaultName = t("defaults.projectReport");
    var name =
      auditPayload && auditPayload.projectName != null && String(auditPayload.projectName).trim() !== ""
        ? String(auditPayload.projectName).trim()
        : defaultName;
    var fullTitle = name ? prefix + " — " + name : prefix;
    var titleEl = document.getElementById("dash-audit-title");
    var drillProj = document.getElementById("dash-drill-project-name");
    if (titleEl) titleEl.textContent = fullTitle;
    if (drillProj) drillProj.textContent = fullTitle;

    var metaRoot = document.getElementById("dash-audit-meta");

    if (metaRoot) {
      metaRoot.innerHTML = "";
      metaRoot.hidden = true;
      var hasMeta = false;
      if (banner.repoUrl) {
        hasMeta = true;
        var repo = document.createElement("div");
        repo.className = "audit-banner__repo";
        repo.textContent = String(banner.repoUrl);
        metaRoot.appendChild(repo);
      }
      if (banner.appUrl) {
        hasMeta = true;
        var link = document.createElement("a");
        link.className = "audit-banner__link";
        link.href = String(banner.appUrl);
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = String(banner.appUrl);
        metaRoot.appendChild(link);
      }
      if (banner.commitId || banner.auditTimestamp) {
        hasMeta = true;
        var line = document.createElement("div");
        line.className = "audit-banner__commit-line";
        var parts = [];
        if (banner.commitId) parts.push(t("audit.commitLabel") + " " + shortCommitDisplay(banner.commitId));
        if (banner.auditTimestamp) {
          parts.push(t("audit.generatedLabel") + " " + String(banner.auditTimestamp));
        }
        line.textContent = parts.join(" · ");
        metaRoot.appendChild(line);
      }
      metaRoot.hidden = !hasMeta;
    }

    syncDashStatusBadges(null, banner);
  }

  function applyPayload(rawPayload) {
    var auditPayload =
      rawPayload && typeof rawPayload === "object" ? rawPayload : null;

    if (auditPayload && auditPayload.locale != null && window.AuditDashboardI18n) {
      window.AuditDashboardI18n.setLocale(String(auditPayload.locale), false);
    }

    resetDrillMetrics();

    var M = window.AuditDashboardMetrics;
    var flat =
      auditPayload && M && typeof M.getFlatMetricsFromPayload === "function"
        ? M.getFlatMetricsFromPayload(auditPayload)
        : null;

    if (flat) {
      applyMetricsModeDashboard(flat, auditPayload);
    } else {
      applyLegacyDashboard(auditPayload);
    }
  }

  globalThis.__AUDIT_ON_HOST_THEME_SYNC__ = function () {
    updateThemeToggleUI();
    try {
      reinitDonutFromPayload();
    } catch (hostThemeDonutError) { /* ignore */ }
  };

  /** MCP App: host sends tool args via ontoolinput; apply same payload shape as ?data= / injected script. */
  globalThis.__AUDIT_APPLY_DASHBOARD_PAYLOAD__ = function (payload) {
    if (payload != null && typeof payload === "object") {
      globalThis.__UI_AUDIT_DASHBOARD__ = payload;
    } else {
      try {
        delete globalThis.__UI_AUDIT_DASHBOARD__;
      } catch (clearPayloadError) {
        globalThis.__UI_AUDIT_DASHBOARD__ = undefined;
      }
    }
    applyPayload(getEffectivePayload());
    reinitDonutFromPayload();
    updateThemeToggleUI();
    try {
      runOverviewRowBarAnimations(document.getElementById("dash-domains"));
    } catch (rowAnimError) { /* ignore */ }
  };

  try {
    var payload = getEffectivePayload();
    applyPayload(payload);
    reinitDonutFromPayload();
    wireDrilldownHandlers();
    initThemeToggle();
    initPdfExportControl();
    var summaryBig = document.getElementById("dash-total-compliance");
    if (summaryBig && !summaryBig.dataset.chartEnter) {
      summaryBig.dataset.chartEnter = "1";
      summaryBig.classList.add("summary-stat--enter");
    }
    runOverviewRowBarAnimations(document.getElementById("dash-domains"));
  } catch (dashboardInitError) {
    console.warn("dashboard init", dashboardInitError);
  }
