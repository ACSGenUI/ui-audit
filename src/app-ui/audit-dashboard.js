    (function () {
      var THEME_STORAGE_KEY = "ui-audit-theme";

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

      /** Inline SVGs (static); cycled per metric row inside category cards. */
      var METRIC_PILLAR_SVGS = [
        '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 9v12" /></svg>',
        '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="3" /><path d="M6 20v-2a4 4 0 014-4h4a4 4 0 014 4v2M12 11v4" /></svg>',
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" /></svg>',
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 18l6-6-6-6M8 6L2 12l6 6" /></svg>',
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 12l2 2 4-4" /></svg>',
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>',
      ];

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
        if (!skipDomainRows) {
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
              syncRowProgressUi(row, parseInt(dp, 10), parseInt(dt, 10));
            } else {
              var ve = row.querySelector(".row-value");
              var syn = resolvePassedTotal({ value: ve ? ve.textContent : 0 });
              syncRowProgressUi(row, syn.passed, syn.total);
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

      function scoreTierClass(score) {
        var numericScore = Number(score);
        if (!isFinite(numericScore)) return "score-tier-neutral";
        if (numericScore < 40) return "score-tier-red";
        if (numericScore < 90) return "score-tier-amber";
        return "score-tier-green";
      }

      function clampPct(value) {
        if (!isFinite(value)) return 0;
        return Math.max(0, Math.min(100, value));
      }

      function resolvePassedTotal(domain) {
        var passedRaw = domain.passed != null ? Number(domain.passed) : NaN;
        var totalRaw = domain.total != null ? Number(domain.total) : NaN;
        var val = clampPct(Number(domain.value));
        if (isFinite(passedRaw) && isFinite(totalRaw) && totalRaw > 0) {
          var total = Math.max(1, Math.round(totalRaw));
          var passed = Math.round(passedRaw);
          passed = Math.max(0, Math.min(total, passed));
          return { passed: passed, total: total };
        }
        if (isFinite(passedRaw) && !isFinite(totalRaw)) {
          var t50 = 50;
          var p50 = Math.max(0, Math.min(t50, Math.round(passedRaw)));
          return { passed: p50, total: t50 };
        }
        if (!isFinite(passedRaw) && isFinite(totalRaw) && totalRaw > 0) {
          var tOnly = Math.max(1, Math.round(totalRaw));
          var pFromScore = Math.round((val / 100) * tOnly);
          pFromScore = Math.max(0, Math.min(tOnly, pFromScore));
          return { passed: pFromScore, total: tOnly };
        }
        var defaultTotal = 50;
        var p = Math.round((val / 100) * defaultTotal);
        return { passed: Math.max(0, Math.min(defaultTotal, p)), total: defaultTotal };
      }

      function formatPassedTotalLabel(passed, total) {
        var loc = numberLocaleTag();
        return passed.toLocaleString(loc) + "/" + total.toLocaleString(loc);
      }

      function syncRowProgressUi(row, passed, total) {
        var valEl = row.querySelector(".row-value");
        var scoreNum = valEl ? Number(String(valEl.textContent).replace(/[^0-9.-]/g, "")) : NaN;
        var tier = scoreTierClass(isFinite(scoreNum) ? scoreNum : 0);
        var meta = row.querySelector(".row-passed-total");
        var hint = row.querySelector(".row-progress-hint");
        var fill = row.querySelector(".row-progress-fill");
        var progressRoot = row.querySelector(".row-progress");
        if (meta) meta.textContent = formatPassedTotalLabel(passed, total);
        if (hint) hint.textContent = t("domain.passedTotalHint");
        if (fill) {
          fill.className = "row-progress-fill " + tier;
          var pct = total > 0 ? (100 * passed) / total : 0;
          pct = Math.min(100, Math.max(0, pct));
          fill.style.setProperty("--row-bar-target", pct + "%");
          fill.classList.remove("row-progress-fill--expanded");
        }
        if (progressRoot) {
          progressRoot.setAttribute(
            "aria-label",
            t("domain.rowProgressAria", { passed: String(passed), total: String(total) })
          );
        }
      }

      function runOverviewRowBarAnimations(root) {
        if (!root) return;
        var fills = root.querySelectorAll(".row-progress-fill");
        if (!fills.length) return;
        if (prefersReducedMotion()) {
          fills.forEach(function (f) {
            f.classList.add("row-progress-fill--expanded");
          });
          return;
        }
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            fills.forEach(function (f) {
              f.classList.add("row-progress-fill--expanded");
            });
          });
        });
      }

      function readPayload() {
        if (typeof window.__PRODUCT_AUDIT_DASHBOARD__ === "object" && window.__PRODUCT_AUDIT_DASHBOARD__ !== null)
          return window.__PRODUCT_AUDIT_DASHBOARD__;
        try {
          var raw = new URLSearchParams(window.location.search).get("data");
          if (raw) return JSON.parse(decodeURIComponent(raw));
        } catch (payloadParseError) { /* ignore */ }
        return null;
      }

      /** Injected or ?data= payload if any; otherwise dashboard sample from AuditDashboardMetrics.DEFAULT_AUDIT_METRICS. */
      function getEffectivePayload() {
        var p = readPayload();
        if (p != null) return p;
        var M = window.AuditDashboardMetrics;
        if (!M || !M.DEFAULT_AUDIT_METRICS) return null;
        var name = String(M.DEFAULT_AUDIT_METRICS["metadata.projectName"] || "").trim();
        return {
          metrics: M.DEFAULT_AUDIT_METRICS,
          ...(name ? { projectName: name } : {}),
        };
      }

      function sectorPath(cx, cy, r0, r1, a0, a1) {
        var xo0 = cx + r1 * Math.cos(a0);
        var yo0 = cy + r1 * Math.sin(a0);
        var xo1 = cx + r1 * Math.cos(a1);
        var yo1 = cy + r1 * Math.sin(a1);
        var xi0 = cx + r0 * Math.cos(a0);
        var yi0 = cy + r0 * Math.sin(a0);
        var xi1 = cx + r0 * Math.cos(a1);
        var yi1 = cy + r0 * Math.sin(a1);
        var sweep = 1;
        var large = a1 - a0 > Math.PI ? 1 : 0;
        return (
          "M " +
          xo0 +
          " " +
          yo0 +
          " A " +
          r1 +
          " " +
          r1 +
          " 0 " +
          large +
          " " +
          sweep +
          " " +
          xo1 +
          " " +
          yo1 +
          " L " +
          xi1 +
          " " +
          yi1 +
          " A " +
          r0 +
          " " +
          r0 +
          " 0 " +
          large +
          " 0 " +
          xi0 +
          " " +
          yi0 +
          " Z"
        );
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

      function prefersReducedMotion() {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      }

      function animatePercentLabel(pctEl, targetPct, durationMs) {
        if (!pctEl || !isFinite(targetPct)) return;
        if (prefersReducedMotion()) {
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

      function clamp255(n) {
        return Math.max(0, Math.min(255, Math.round(n)));
      }

      function parseCssColorToRgb(input) {
        if (input == null || typeof input !== "string") return null;
        var s = input.trim();
        var m = /^#([a-f\d]{3})$/i.exec(s);
        if (m) {
          var h = m[1];
          return {
            r: parseInt(h[0] + h[0], 16),
            g: parseInt(h[1] + h[1], 16),
            b: parseInt(h[2] + h[2], 16),
          };
        }
        m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(s);
        if (m) {
          return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
        }
        m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(s);
        if (m) {
          return { r: clamp255(+m[1]), g: clamp255(+m[2]), b: clamp255(+m[3]) };
        }
        return null;
      }

      function relativeLuminanceRgb(rgb) {
        function lin(c) {
          c = c / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        }
        return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
      }

      /** Picks white or near-black for maximum contrast vs segment fill (handles rgb() from getComputedStyle). */
      function tooltipStyleForBackground(cssColor) {
        var rgb = parseCssColorToRgb(cssColor);
        if (!rgb) {
          return { color: "#0f172a", textShadow: "none" };
        }
        var Lbg = relativeLuminanceRgb(rgb);
        var contrastWhite = (1 + 0.05) / (Lbg + 0.05);
        var contrastBlack = (Lbg + 0.05) / 0.05;
        if (contrastWhite >= contrastBlack) {
          return { color: "#ffffff", textShadow: "0 1px 2px rgba(0, 0, 0, 0.5)" };
        }
        return { color: "#0f172a", textShadow: "none" };
      }

      var auditChartState = {
        domainSlices: [],
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
        if (!tbody) return;
        tbody.innerHTML = "";
        var list =
          rows && rows.length ? rows : [{ metric: t("drill.noMetrics"), compliance: "—", score: "" }];
        var barRuns = [];
        list.forEach(function (metricRow, rowIndex) {
          var tr = document.createElement("tr");
          tr.className = "metrics-row--animate";
          tr.style.setProperty("--metrics-row-delay", rowIndex * 42 + "ms");
          var tier = scoreTierClass(metricRow.score);
          var pct = clampPct(Number(metricRow.score));
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
            if (prefersReducedMotion()) {
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
        if (!svg || !tip || !wrap) return;

        var usePre = precomputedSlices !== undefined && precomputedSlices !== null;
        var domainSlices = usePre ? precomputedSlices : readDomainsFromDom();

        if (!domainSlices.length) {
          while (svg.firstChild) svg.removeChild(svg.firstChild);
          var onlyCenter =
            overrideCenterPct != null && isFinite(Number(overrideCenterPct))
              ? Math.round(Number(overrideCenterPct))
              : 0;
          auditChartState.domainSlices = [];
          auditChartState.overviewCenterPercent = onlyCenter;
          setDonutCenter(onlyCenter, t("donut.overall"), "var(--text-muted)", {
            animatePercent: !auditChartState.centerPctAnimated,
          });
          auditChartState.centerPctAnimated = true;
          return;
        }

        auditChartState.domainSlices = domainSlices;
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
          path.setAttribute("d", sectorPath(cx, cy, r0, r1, a0, a1));
          path.setAttribute("fill", domainSlices[i].color);
          path.setAttribute("class", "donut-seg donut-seg--animate-in");
          path.style.setProperty("--donut-enter-delay", prefersReducedMotion() ? "0ms" : i * 46 + "ms");
          path.dataset.title = domainSlices[i].title;
          path.dataset.value = String(Math.round(domainSlices[i].value));

          (function (slice, midA) {
            path.addEventListener("mouseenter", function () {
              tip.textContent = slice.title + ": " + Math.round(slice.value);
              tip.style.backgroundColor = slice.color;
              var tipStyle = tooltipStyleForBackground(slice.color);
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

      function normalizeRagRating(s) {
        var u = String(s || "")
          .trim()
          .toLowerCase();
        if (u === "red") return "Red";
        if (u === "amber" || u === "yellow") return "Amber";
        if (u === "green") return "Green";
        return null;
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
        if (isAuditFieldEmpty(b.auditTimestamp) && (v = pickMetric(f, "metadata.auditTimestamp")) != null) {
          b.auditTimestamp = String(v);
        }
        if (isAuditFieldEmpty(b.ragRating) && (v = pickMetric(f, "overallStatus.ragRating")) != null) {
          var normRag = normalizeRagRating(String(v));
          b.ragRating = normRag || String(v);
        }
        if (!p.checklistSummaryMetrics) p.checklistSummaryMetrics = {};
        var c = p.checklistSummaryMetrics;
        if (isAuditFieldEmpty(c.totalChecks) && (v = pickMetric(f, "summary.totalChecks")) != null) c.totalChecks = v;
        if (isAuditFieldEmpty(c.passed) && (v = pickMetric(f, "summary.passed")) != null) c.passed = v;
        if (isAuditFieldEmpty(c.failed) && (v = pickMetric(f, "summary.failed")) != null) c.failed = v;
        if (isAuditFieldEmpty(c.notApplicable) && (v = pickMetric(f, "summary.notApplicable")) != null) {
          c.notApplicable = v;
        }
        if (isAuditFieldEmpty(c.criticalFailed) && (v = pickMetric(f, "summary.criticalFailed")) != null) {
          c.criticalFailed = v;
        }
        if (isAuditFieldEmpty(c.highFailed) && (v = pickMetric(f, "summary.highFailed")) != null) c.highFailed = v;
        if (isAuditFieldEmpty(c.mediumFailed) && (v = pickMetric(f, "summary.mediumFailed")) != null) {
          c.mediumFailed = v;
        }
        if (isAuditFieldEmpty(c.mandatoryFailed) && (v = pickMetric(f, "summary.mandatoryFailed")) != null) {
          c.mandatoryFailed = v;
        }
        if (!p.passRates) p.passRates = {};
        var pr = p.passRates;
        if (isAuditFieldEmpty(pr.mandatoryPassRate) && (v = pickMetric(f, "overallStatus.mandatoryPassRate")) != null) {
          pr.mandatoryPassRate = v;
        }
        if (isAuditFieldEmpty(pr.criticalPassRate) && (v = pickMetric(f, "overallStatus.criticalPassRate")) != null) {
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

      function formatDomainScore(n) {
        if (n == null || !isFinite(n)) return "0";
        return Math.abs(n % 1) < 1e-9 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
      }

      function deriveEdsDomainsFromMetrics(p) {
        if (!p || !p.metrics || typeof p.metrics !== "object" || p.ignoreMetricsDomains === true) return;
        var f = p.metrics;
        if (pickMetric(f, "overallScores.uiQualityScore") == null) return;
        if (p.domains && p.domains.length > 0 && p.deriveDomainsFromMetrics !== true) return;

        function uxComplianceScore() {
          var direct = scoreFromFlat(f, "overallScores.uxComplianceScore");
          if (direct != null) return direct;
          var h = scoreFromFlat(f, "overallScores.htmlScore");
          var c = scoreFromFlat(f, "overallScores.cssScore");
          var j = scoreFromFlat(f, "overallScores.javascriptScore");
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
            scoreKey: "overallScores.uiQualityScore",
          },
          {
            domainKey: "accessibility",
            titleKey: "domain.accessibility.title",
            subKey: "domain.accessibility.subtitle",
            scoreKey: "overallScores.accessibilityScore",
          },
          {
            domainKey: "performance",
            titleKey: "domain.performance.title",
            subKey: "domain.performance.subtitle",
            scoreKey: "overallScores.performanceScore",
          },
          {
            domainKey: "code-quality",
            titleKey: "domain.code-quality.title",
            subKey: "domain.code-quality.subtitle",
            scoreKey: "overallScores.codeQualityScore",
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
            scoreKey: "overallScores.securityScore",
          },
        ];

        p.domains = spec.map(function (row) {
          var n = typeof row.scoreFn === "function" ? row.scoreFn() : scoreFromFlat(f, row.scoreKey);
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
        if (pickMetric(f, "overallScores.uiQualityScore") == null) return;
        if (p.preservePayloadHeadlines === true) return;

        var tc = pickMetric(f, "summary.totalChecks");
        if (tc != null && isAuditFieldEmpty(p.checklistSummaryLine)) {
          var num = Number(tc);
          p.checklistSummaryLine =
            (isFinite(num) ? num.toLocaleString(numberLocaleTag()) : String(tc)) +
            " " +
            t("defaults.checklistTotalSuffix");
        }

        var uiq = scoreFromFlat(f, "overallScores.uiQualityScore");
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
        var ragWrap = document.getElementById("dash-rag-wrap");
        var ragBadge = document.getElementById("dash-rag-badge");
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

        if (ragWrap && ragBadge) {
          var ragRaw = flat["overallStatus.ragRating"];
          var rag = normalizeRagRating(ragRaw != null ? String(ragRaw) : "");
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

      function pickFlatMetricNumber(flat, key) {
        if (!flat || flat[key] === undefined || flat[key] === null || flat[key] === "") return NaN;
        var n = Number(flat[key]);
        return isFinite(n) ? n : NaN;
      }

      function formatSummaryPercentDisplay(pct) {
        if (!isFinite(pct)) return "0";
        var rounded = Math.round(pct * 10) / 10;
        return Math.abs(rounded % 1) < 0.05 ? String(Math.round(rounded)) : String(rounded);
      }

      function paintSummaryMiniDonut(svg, sliceCounts, colors) {
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        var cx = 50;
        var cy = 50;
        var r0 = 30;
        var r1 = 47;
        var gapRad = (2 * Math.PI * 1.5) / 360;
        var sum = 0;
        for (var i = 0; i < sliceCounts.length; i++) sum += Math.max(0, sliceCounts[i].count);
        if (sum <= 0) {
          var pathEmpty = document.createElementNS("http://www.w3.org/2000/svg", "path");
          pathEmpty.setAttribute("d", sectorPath(cx, cy, r0, r1, -Math.PI / 2, 1.5 * Math.PI));
          pathEmpty.setAttribute("fill", "var(--summary-mini-donut-empty)");
          pathEmpty.setAttribute("class", "donut-seg donut-seg--animate-in");
          svg.appendChild(pathEmpty);
          return;
        }
        var active = sliceCounts.filter(function (s) {
          return s.count > 0;
        });
        if (!active.length) return;
        var totalGaps = Math.max(0, active.length - 1) * gapRad;
        var avail = Math.max(0.01, 2 * Math.PI - totalGaps);
        var angleCursor = -Math.PI / 2 + gapRad / 2;
        for (var j = 0; j < active.length; j++) {
          var frac = active[j].count / sum;
          var span = avail * frac;
          var a0 = angleCursor;
          var a1 = angleCursor + span;
          angleCursor = a1 + gapRad;
          var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", sectorPath(cx, cy, r0, r1, a0, a1));
          path.setAttribute("fill", active[j].color || colors[j % colors.length]);
          path.setAttribute("class", "donut-seg donut-seg--animate-in");
          path.style.setProperty("--donut-enter-delay", prefersReducedMotion() ? "0ms" : j * 40 + "ms");
          svg.appendChild(path);
        }
      }

      function appendSummaryAuditDonutCard(parent, title, passedRaw, failedRaw, totalRaw) {
        var passed = isFinite(Number(passedRaw)) ? Math.max(0, Number(passedRaw)) : 0;
        var failed = isFinite(Number(failedRaw)) ? Math.max(0, Number(failedRaw)) : 0;
        var total = isFinite(Number(totalRaw)) ? Math.max(0, Number(totalRaw)) : 0;
        if (total <= 0) total = passed + failed;
        var other = Math.max(0, total - passed - failed);
        var card = document.createElement("div");
        card.className = "summary-mini-donut-card";
        var h4 = document.createElement("h4");
        h4.className = "summary-mini-donut-card__title";
        h4.textContent = title;
        var wrap = document.createElement("div");
        wrap.className = "summary-mini-donut-wrap";
        var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 100 100");
        svg.setAttribute("class", "summary-mini-donut-svg");
        svg.setAttribute("role", "img");
        var ariaParts = [];
        if (total > 0) {
          ariaParts.push(
            t("insights.row.passed") + " " + passed,
            t("insights.row.failed") + " " + failed
          );
          if (other > 0) ariaParts.push(t("metrics.summary.otherSlice") + " " + other);
          ariaParts.push(t("insights.row.totalChecks") + " " + total);
        }
        svg.setAttribute("aria-label", title + (ariaParts.length ? ". " + ariaParts.join(", ") : ""));
        var sliceSpec = [
          { count: passed, color: "var(--summary-donut-passed)" },
          { count: failed, color: "var(--summary-donut-failed)" },
        ];
        if (other > 0) sliceSpec.push({ count: other, color: "var(--summary-donut-neutral)" });
        paintSummaryMiniDonut(svg, sliceSpec, ["var(--summary-donut-passed)", "var(--summary-donut-failed)"]);
        var center = document.createElement("div");
        center.className = "summary-mini-donut-center";
        var pctEl = document.createElement("span");
        pctEl.className = "summary-mini-donut-pct";
        var hintEl = document.createElement("span");
        hintEl.className = "summary-mini-donut-hint";
        hintEl.textContent = t("metrics.summary.passRateHint");
        if (total > 0) {
          pctEl.textContent = formatSummaryPercentDisplay((100 * passed) / total) + "%";
        } else {
          pctEl.textContent = "—";
        }
        center.appendChild(pctEl);
        center.appendChild(hintEl);
        wrap.appendChild(svg);
        wrap.appendChild(center);
        var legend = document.createElement("div");
        legend.className = "summary-mini-donut-legend";
        function addLegendRow(label, colorVar, count, denom) {
          var col = document.createElement("div");
          col.className = "summary-mini-donut-legend__col";
          var lab = document.createElement("div");
          lab.className = "summary-mini-donut-legend__label";
          lab.textContent = label;
          var pill = document.createElement("div");
          pill.className = "summary-mini-donut-legend__pill";
          pill.style.background = colorVar;
          var val = document.createElement("div");
          val.className = "summary-mini-donut-legend__pct";
          var frac = denom > 0 ? count / denom : 0;
          val.textContent = t("metrics.summary.pctLegend", { n: formatSummaryPercentDisplay(100 * frac) });
          col.appendChild(lab);
          col.appendChild(pill);
          col.appendChild(val);
          legend.appendChild(col);
        }
        if (total > 0) {
          addLegendRow(t("insights.row.passed"), "var(--summary-donut-passed)", passed, total);
          addLegendRow(t("insights.row.failed"), "var(--summary-donut-failed)", failed, total);
          if (other > 0) addLegendRow(t("metrics.summary.otherSlice"), "var(--summary-donut-neutral)", other, total);
        } else {
          var empty = document.createElement("div");
          empty.className = "summary-mini-donut-legend__empty";
          empty.textContent = "—";
          legend.appendChild(empty);
        }
        card.appendChild(h4);
        card.appendChild(wrap);
        card.appendChild(legend);
        parent.appendChild(card);
      }

      function totalsNearlyEqual(a, b) {
        return isFinite(a) && isFinite(b) && Math.abs(a - b) < 0.5;
      }

      function buildSummaryStackedBarModel(flat) {
        var total = pickFlatMetricNumber(flat, "summary.totalChecks");
        var passed = pickFlatMetricNumber(flat, "summary.passed");
        var crit = pickFlatMetricNumber(flat, "summary.criticalFailed");
        var high = pickFlatMetricNumber(flat, "summary.highFailed");
        var med = pickFlatMetricNumber(flat, "summary.mediumFailed");
        if (isFinite(total) && total > 0 && isFinite(passed) && isFinite(crit) && isFinite(high) && isFinite(med)) {
          if (totalsNearlyEqual(passed + crit + high + med, total)) {
            return {
              segments: [
                {
                  label: t("insights.row.passed"),
                  value: passed,
                  color: "#f3f4f6",
                  textClass: "summary-stacked-seg--text-dark",
                },
                {
                  label: t("insights.row.criticalFailed"),
                  value: crit,
                  color: "#7c65ff",
                  textClass: "summary-stacked-seg--text-light",
                },
                {
                  label: t("insights.row.highFailed"),
                  value: high,
                  color: "#00c2ff",
                  textClass: "summary-stacked-seg--text-light",
                },
                {
                  label: t("insights.row.mediumFailed"),
                  value: med,
                  color: "#202939",
                  textClass: "summary-stacked-seg--text-light",
                },
              ],
              total: total,
            };
          }
        }
        var failed = pickFlatMetricNumber(flat, "summary.failed");
        var na = pickFlatMetricNumber(flat, "summary.notApplicable");
        if (isFinite(total) && total > 0 && isFinite(passed) && isFinite(failed) && isFinite(na)) {
          if (totalsNearlyEqual(passed + failed + na, total)) {
            return {
              segments: [
                {
                  label: t("insights.row.passed"),
                  value: passed,
                  color: "#f3f4f6",
                  textClass: "summary-stacked-seg--text-dark",
                },
                {
                  label: t("insights.row.failed"),
                  value: failed,
                  color: "#7c65ff",
                  textClass: "summary-stacked-seg--text-light",
                },
                {
                  label: t("insights.row.notApplicable"),
                  value: na,
                  color: "#00c2ff",
                  textClass: "summary-stacked-seg--text-light",
                },
              ],
              total: total,
            };
          }
        }
        return null;
      }

      function appendSummaryStackedBarBlock(parent, flat) {
        var model = buildSummaryStackedBarModel(flat);
        if (!model || !model.segments.length) return;
        var block = document.createElement("div");
        block.className = "summary-stacked";
        var h4 = document.createElement("h4");
        h4.className = "summary-stacked__title";
        h4.textContent = t("metrics.summary.checklistDistribution");
        var labelTrack = document.createElement("div");
        labelTrack.className = "summary-stacked__label-track";
        var bar = document.createElement("div");
        bar.className = "summary-stacked__bar";
        bar.setAttribute("role", "img");
        bar.setAttribute(
          "aria-label",
          t("metrics.summary.checklistDistribution") +
            ": " +
            model.segments
              .map(function (s) {
                return s.label + " " + s.value;
              })
              .join(", ")
        );
        var total = model.total;
        var cumulative = 0;
        model.segments.forEach(function (seg, idx) {
          var pct = total > 0 ? (100 * seg.value) / total : 0;
          var lab = document.createElement("span");
          lab.className =
            "summary-stacked__label" +
            (idx === 0 ? " summary-stacked__label--start" : " summary-stacked__label--tick");
          lab.textContent = seg.label;
          lab.style.left = cumulative + "%";
          labelTrack.appendChild(lab);
          var segEl = document.createElement("div");
          segEl.className = "summary-stacked__seg";
          segEl.style.width = pct + "%";
          var fill = document.createElement("div");
          fill.className = "summary-stacked__seg-fill " + (seg.textClass || "");
          fill.style.background = seg.color;
          var innerPct = document.createElement("span");
          innerPct.className = "summary-stacked__seg-pct";
          innerPct.textContent = formatSummaryPercentDisplay(pct) + "%";
          if (pct < 6 && seg.value > 0) innerPct.classList.add("summary-stacked__seg-pct--hidden");
          fill.appendChild(innerPct);
          segEl.appendChild(fill);
          bar.appendChild(segEl);
          cumulative += pct;
        });
        block.appendChild(h4);
        block.appendChild(labelTrack);
        block.appendChild(bar);
        parent.appendChild(block);
      }

      function runSummaryStackedBarAnimations(root) {
        if (!root) return;
        var fills = root.querySelectorAll(".summary-stacked__seg-fill");
        if (!fills.length) return;
        if (prefersReducedMotion()) {
          fills.forEach(function (f) {
            f.classList.add("summary-stacked__seg-fill--expanded");
          });
          return;
        }
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            fills.forEach(function (f) {
              f.classList.add("summary-stacked__seg-fill--expanded");
            });
          });
        });
      }

      function renderMetricCategoryGrid(flat) {
        var M = window.AuditDashboardMetrics;
        var root = document.getElementById("metric-categories-root");
        if (!M || !root || !flat) return;
        var grouped = M.groupMetricsByCategory(flat);
        window.__METRICS_DRILL_GROUPS__ = grouped;
        root.innerHTML = "";
        var names = M.sortCategoryNames(Object.keys(grouped));
        names.forEach(function (cat) {
          if (cat === "metadata") return;
          var rows = grouped[cat].filter(function (row) {
            return !(cat === "overallStatus" && row.restPath === "ragRating");
          });
          if (!rows.length) return;
          var card = document.createElement("article");
          card.className = "metric-category-card";
          card.setAttribute("role", "button");
          card.setAttribute("tabindex", "0");
          card.dataset.category = cat;
          card.setAttribute(
            "aria-label",
            t("metrics.openCategory", {
              name: cat === "_root" ? t("metrics.uncategorized") : M.humanizeSegment(cat),
            })
          );
          var h = document.createElement("h3");
          h.className = "metric-category-card__title";
          h.textContent = cat === "_root" ? t("metrics.uncategorized") : M.humanizeSegment(cat);
          if (cat === "summary") {
            card.classList.add("metric-category-card--summary");
            var shell = document.createElement("div");
            shell.className = "metric-summary-shell";
            shell.setAttribute("role", "presentation");
            var donutsRow = document.createElement("div");
            donutsRow.className = "metric-summary-donuts";
            appendSummaryAuditDonutCard(
              donutsRow,
              t("metrics.summary.browserAuditTitle"),
              pickFlatMetricNumber(flat, "summary.browserAuditPassed"),
              pickFlatMetricNumber(flat, "summary.browserAuditFailed"),
              pickFlatMetricNumber(flat, "summary.browserAuditTotal")
            );
            appendSummaryAuditDonutCard(
              donutsRow,
              t("metrics.summary.codeAuditTitle"),
              pickFlatMetricNumber(flat, "summary.codeAuditPassed"),
              pickFlatMetricNumber(flat, "summary.codeAuditFailed"),
              pickFlatMetricNumber(flat, "summary.codeAuditTotal")
            );
            shell.appendChild(donutsRow);
            appendSummaryStackedBarBlock(shell, flat);
            card.appendChild(h);
            card.appendChild(shell);
            root.appendChild(card);
            return;
          }
          var pillars = document.createElement("div");
          pillars.className = "metric-category-pillars";
          rows.forEach(function (r, idx) {
            var ts = M.metricRowTitleAndSubtitle(r.restPath);
            var num = Number(r.value);
            var scoreLike = M.isScoreLikeMetric(r.restPath, r.fullKey) && isFinite(num);
            var row = document.createElement("div");
            row.className = "row metric-category-pillar";
            var iconBox = document.createElement("div");
            iconBox.className = "icon-box";
            var iconIdx = idx % METRIC_PILLAR_SVGS.length;
            iconBox.style.background = "var(--icon-row-" + (iconIdx + 1) + ")";
            iconBox.innerHTML = METRIC_PILLAR_SVGS[iconIdx];
            var body = document.createElement("div");
            body.className = "row-body";
            var head = document.createElement("div");
            head.className = "row-head";
            var titles = document.createElement("div");
            titles.className = "row-titles";
            var titleEl = document.createElement("div");
            titleEl.className = "row-title";
            titleEl.textContent = ts.title || M.formatMetricRestPathLabel(r.restPath);
            var subEl = document.createElement("div");
            subEl.className = "row-sub";
            var subText = ts.subtitle;
            if (!subText) {
              var full = M.formatMetricRestPathLabel(r.restPath);
              if (full !== titleEl.textContent) subText = full;
            }
            if (subText) subEl.textContent = subText;
            else subEl.hidden = true;
            titles.appendChild(titleEl);
            titles.appendChild(subEl);
            var valEl = document.createElement("div");
            valEl.className = "row-value";
            valEl.textContent = scoreLike ? formatDomainScore(num) : formatMetricValue(r.value);
            head.appendChild(titles);
            head.appendChild(valEl);
            body.appendChild(head);
            if (scoreLike) {
              var progress = document.createElement("div");
              progress.className = "row-progress";
              var meta = document.createElement("div");
              meta.className = "row-progress-meta";
              var pt = document.createElement("span");
              pt.className = "row-passed-total";
              var hint = document.createElement("span");
              hint.className = "row-progress-hint";
              meta.appendChild(pt);
              meta.appendChild(hint);
              var bar = document.createElement("div");
              bar.className = "row-progress-bar";
              var fill = document.createElement("div");
              fill.className = "row-progress-fill";
              bar.appendChild(fill);
              progress.appendChild(meta);
              progress.appendChild(bar);
              body.appendChild(progress);
            }
            row.appendChild(iconBox);
            row.appendChild(body);
            if (scoreLike) {
              var domainLike = {
                value: clampPct(num),
              };
              var pr = resolvePassedTotal(domainLike);
              syncRowProgressUi(row, pr.passed, pr.total);
            }
            pillars.appendChild(row);
          });
          card.appendChild(h);
          card.appendChild(pillars);
          root.appendChild(card);
        });
        runOverviewRowBarAnimations(root);
        runSummaryStackedBarAnimations(root);
      }

      function applyMetricsModeDashboard(flat, auditPayload) {
        mergeFlatMetricsIntoAuditPayload(auditPayload);
        applyStaticDomI18n({ skipDomainRows: true });
        renderBannerFromFlatMetrics(flat, auditPayload);
        renderMetricCategoryGrid(flat);
        var checklistEl = document.getElementById("dash-checklist-summary");
        var tc = flat["summary.totalChecks"];
        if (checklistEl && tc != null && tc !== "") {
          var num = Number(tc);
          checklistEl.textContent =
            (isFinite(num) ? num.toLocaleString(numberLocaleTag()) : String(tc)) +
            " " +
            t("defaults.checklistTotalSuffix");
        } else if (checklistEl && auditPayload && auditPayload.checklistSummaryLine != null) {
          checklistEl.textContent = auditPayload.checklistSummaryLine;
        }
        var totalEl = document.getElementById("dash-total-compliance");
        var uiq = flat["overallScores.uiQualityScore"];
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
        if (payloadReplacesDomains && domRoot) {
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
            var counts = resolvePassedTotal(domain);
            row.setAttribute("data-passed", String(counts.passed));
            row.setAttribute("data-total", String(counts.total));
            syncRowProgressUi(row, counts.passed, counts.total);
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
        var ragWrap = document.getElementById("dash-rag-wrap");
        var ragBadge = document.getElementById("dash-rag-badge");

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

        if (ragWrap && ragBadge) {
          var rag = normalizeRagRating(banner.ragRating != null ? banner.ragRating : "");
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

      try {
        var payload = getEffectivePayload();
        applyPayload(payload);
        reinitDonutFromPayload();
        wireDrilldownHandlers();
        initThemeToggle();
        var summaryBig = document.getElementById("dash-total-compliance");
        if (summaryBig && !summaryBig.dataset.chartEnter) {
          summaryBig.dataset.chartEnter = "1";
          summaryBig.classList.add("summary-stat--enter");
        }
        runOverviewRowBarAnimations(document.getElementById("dash-domains"));
      } catch (dashboardInitError) {
        console.warn("dashboard init", dashboardInitError);
      }
    })();
