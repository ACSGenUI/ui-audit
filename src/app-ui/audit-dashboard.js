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
              var payload = readPayload();
              var parsedOverviewCenter =
                payload && payload.overviewCenterPercent != null ? Number(payload.overviewCenterPercent) : NaN;
              initComplianceDonut(!isNaN(parsedOverviewCenter) ? parsedOverviewCenter : null);
            } catch (clearThemeDonutError) { /* donut may not exist yet */ }
            return;
          }
          var next = getEffectiveTheme() === "dark" ? "light" : "dark";
          localStorage.setItem(THEME_STORAGE_KEY, next);
          document.documentElement.setAttribute("data-theme", next);
          updateThemeToggleUI();
          try {
            var payload = readPayload();
            var parsedOverviewCenter =
              payload && payload.overviewCenterPercent != null ? Number(payload.overviewCenterPercent) : NaN;
            initComplianceDonut(!isNaN(parsedOverviewCenter) ? parsedOverviewCenter : null);
          } catch (toggleThemeDonutError) { /* ignore */ }
        });
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
          if (!localStorage.getItem(THEME_STORAGE_KEY)) {
            updateThemeToggleUI();
            try {
              var payload = readPayload();
              var parsedOverviewCenter =
                payload && payload.overviewCenterPercent != null ? Number(payload.overviewCenterPercent) : NaN;
              initComplianceDonut(!isNaN(parsedOverviewCenter) ? parsedOverviewCenter : null);
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

      function showDrilldownView(domainKey, title) {
        var overview = document.getElementById("view-overview");
        var drill = document.getElementById("view-drilldown");
        var titleEl = document.getElementById("drill-title");
        if (!overview || !drill || !titleEl) return;
        var metrics = drillMetricsByKey[domainKey];
        if (!metrics || !metrics.length) {
          metrics = [{ metric: t("drill.noDetailedMetricsForDomain"), compliance: "—", score: "" }];
        }
        titleEl.textContent = title || domainKey;
        renderDrillTable(metrics);
        overview.classList.add("is-hidden");
        overview.setAttribute("aria-hidden", "true");
        drill.classList.remove("is-hidden");
        drill.setAttribute("aria-hidden", "false");
        var back = document.getElementById("drill-back");
        if (back) back.focus();
      }

      function showOverviewView() {
        var overview = document.getElementById("view-overview");
        var drill = document.getElementById("view-drilldown");
        if (!overview || !drill) return;
        drill.classList.add("is-hidden");
        drill.setAttribute("aria-hidden", "true");
        overview.classList.remove("is-hidden");
        overview.setAttribute("aria-hidden", "false");
      }

      function wireDrilldownHandlers() {
        var root = document.getElementById("dash-domains");
        var back = document.getElementById("drill-back");
        if (!root) return;

        function activateRow(row) {
          var key = row.getAttribute("data-key");
          var titleEl = row.querySelector(".row-title");
          showDrilldownView(key, titleEl ? titleEl.textContent.trim() : key);
        }

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

      function initComplianceDonut(overrideCenterPct) {
        var svg = document.getElementById("donut-svg");
        var tip = document.getElementById("donut-tooltip");
        var wrap = document.querySelector(".donut-wrap");
        if (!svg || !tip || !wrap) return;

        var domainSlices = readDomainsFromDom();
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

      function applyPayload(auditPayload) {
        if (auditPayload && auditPayload.locale != null && window.AuditDashboardI18n) {
          window.AuditDashboardI18n.setLocale(String(auditPayload.locale), false);
        }

        resetDrillMetrics();

        var payloadReplacesDomains =
          auditPayload && Array.isArray(auditPayload.domains) && auditPayload.domains.length > 0;
        applyStaticDomI18n({ skipDomainRows: !!payloadReplacesDomains });

        if (!auditPayload) {
          mergePayloadDrillMetrics(null);
          return;
        }

        if (auditPayload.projectName != null) {
          var projectLabel = String(auditPayload.projectName).trim();
          if (projectLabel !== "") {
            var projectOverview = document.getElementById("dash-project-name");
            var projectDrill = document.getElementById("dash-drill-project-name");
            if (projectOverview) projectOverview.textContent = projectLabel;
            if (projectDrill) projectDrill.textContent = projectLabel;
          }
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
        if (payloadReplacesDomains) {
          var root = document.getElementById("dash-domains");
          root.innerHTML = "";
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
            root.appendChild(row);
          });
        }

        mergePayloadDrillMetrics(auditPayload);
      }

      try {
        var payload = readPayload();
        applyPayload(payload);
        var parsedOverviewCenter =
          payload && payload.overviewCenterPercent != null ? Number(payload.overviewCenterPercent) : NaN;
        initComplianceDonut(!isNaN(parsedOverviewCenter) ? parsedOverviewCenter : null);
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
