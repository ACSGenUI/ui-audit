/**
 * Audit dashboard — metrics view model.
 * Parses flat metrics, applies app grouping rules, and builds a declarative layout spec
 * for ProgenCraft.views.metrics.renderDashboardView (framework + design system).
 */

const TEXT_DARK = "pc-stacked-bar__seg-fill--text-dark";
const TEXT_LIGHT = "pc-stacked-bar__seg-fill--text-light";

export function formatPercentLabel(pct) {
  if (!isFinite(pct)) return "0";
  var rounded = Math.round(pct * 10) / 10;
  return Math.abs(rounded % 1) < 0.05 ? String(Math.round(rounded)) : String(rounded);
}

function pickFlatMetricNumber(flat, key) {
  if (!flat || flat[key] === undefined || flat[key] === null || flat[key] === "") return NaN;
  var n = Number(flat[key]);
  return isFinite(n) ? n : NaN;
}

function totalsNearlyEqual(a, b) {
  return isFinite(a) && isFinite(b) && Math.abs(a - b) < 0.5;
}

/**
 * Builds stacked-bar segment model from flat summary.* keys (audit metrics schema).
 */
export function buildStackedDistributionModelFromFlat(flat, t) {
  var total = pickFlatMetricNumber(flat, "summary.totalChecks");
  var passed = pickFlatMetricNumber(flat, "summary.passed");
  var crit = pickFlatMetricNumber(flat, "summary.criticalFailed");
  var high = pickFlatMetricNumber(flat, "summary.highFailed");
  var med = pickFlatMetricNumber(flat, "summary.mediumFailed");
  if (isFinite(total) && total > 0 && isFinite(passed) && isFinite(crit) && isFinite(high) && isFinite(med)) {
    if (totalsNearlyEqual(passed + crit + high + med, total)) {
      return {
        segments: [
          { label: t("insights.row.passed"), value: passed, color: "#f3f4f6", textClass: TEXT_DARK },
          { label: t("insights.row.criticalFailed"), value: crit, color: "#7c65ff", textClass: TEXT_LIGHT },
          { label: t("insights.row.highFailed"), value: high, color: "#00c2ff", textClass: TEXT_LIGHT },
          { label: t("insights.row.mediumFailed"), value: med, color: "#202939", textClass: TEXT_LIGHT },
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
          { label: t("insights.row.passed"), value: passed, color: "#f3f4f6", textClass: TEXT_DARK },
          { label: t("insights.row.failed"), value: failed, color: "#7c65ff", textClass: TEXT_LIGHT },
          { label: t("insights.row.notApplicable"), value: na, color: "#00c2ff", textClass: TEXT_LIGHT },
        ],
        total: total,
      };
    }
  }
  return null;
}

/** @returns {{ drillGroups: object | null, cards: object[] }} */
export function buildMetricsCategoryViewModel(flat, ctx) {
  var M = ctx.metrics;
  var t = ctx.t;
  var formatMetricValue = ctx.formatMetricValue;
  var formatDomainScore = ctx.formatDomainScore;
  if (!M || !flat) {
    return { drillGroups: null, cards: [] };
  }
  var grouped = M.groupMetricsByCategory(flat);
  var names = M.sortCategoryNames(Object.keys(grouped));
  var cards = [];

  names.forEach(function (cat) {
    if (cat === "metadata") return;
    var rows = grouped[cat].filter(function (row) {
      return !(cat === "overallStatus" && row.restPath === "ragRating");
    });
    if (!rows.length) return;

    var displayName = cat === "_root" ? t("metrics.uncategorized") : M.humanizeSegment(cat);
    var ariaLabel = t("metrics.openCategory", { name: displayName });

    if (cat === "summary") {
      var stackedModel = buildStackedDistributionModelFromFlat(flat, t);
      cards.push({
        kind: "composite",
        categoryKey: cat,
        title: displayName,
        ariaLabel: ariaLabel,
        sections: [
          {
            kind: "donutRow",
            donuts: [
              {
                title: t("metrics.summary.browserAuditTitle"),
                passed: pickFlatMetricNumber(flat, "summary.browserAuditPassed"),
                failed: pickFlatMetricNumber(flat, "summary.browserAuditFailed"),
                total: pickFlatMetricNumber(flat, "summary.browserAuditTotal"),
              },
              {
                title: t("metrics.summary.codeAuditTitle"),
                passed: pickFlatMetricNumber(flat, "summary.codeAuditPassed"),
                failed: pickFlatMetricNumber(flat, "summary.codeAuditFailed"),
                total: pickFlatMetricNumber(flat, "summary.codeAuditTotal"),
              },
            ],
          },
          {
            kind: "stackedBar",
            model: stackedModel,
            sectionTitle: t("metrics.summary.checklistDistribution"),
          },
        ],
      });
      return;
    }

    var pillarRows = rows.map(function (r) {
      var ts = M.metricRowTitleAndSubtitle(r.restPath);
      var num = Number(r.value);
      var scoreLike = M.isScoreLikeMetric(r.restPath, r.fullKey) && isFinite(num);
      var title = ts.title || M.formatMetricRestPathLabel(r.restPath);
      var subText = ts.subtitle;
      if (!subText) {
        var full = M.formatMetricRestPathLabel(r.restPath);
        if (full !== title) subText = full;
      }
      return {
        title: title,
        subtitle: subText || "",
        valueText: scoreLike ? formatDomainScore(num) : formatMetricValue(r.value),
        scoreLike: scoreLike,
        numericScore: scoreLike ? num : null,
      };
    });

    cards.push({
      kind: "pillars",
      categoryKey: cat,
      title: displayName,
      ariaLabel: ariaLabel,
      rows: pillarRows,
    });
  });

  return { drillGroups: grouped, cards: cards };
}
