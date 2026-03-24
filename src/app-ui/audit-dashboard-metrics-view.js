/**
 * Audit dashboard — metrics view model.
 * Parses flat metrics, applies app grouping rules, and builds a declarative layout spec
 * for ProgenCraft.views.metrics.renderDashboardView (framework + design system).
 */

const TEXT_DARK = "pc-stacked-bar__seg-fill--text-dark";
const TEXT_LIGHT = "pc-stacked-bar__seg-fill--text-light";

/** Distinct bar colors (cycles when there are more rows than entries). */
const SCORES_BAR_PALETTE = [
  "#7c3aed",
  "#0ea5e9",
  "#22c55e",
  "#64748b",
  "#ef4444",
  "#f59e0b",
  "#06b6d4",
  "#8b5cf6",
];

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

/**
 * Audit bucket totals: prefers `summary.{bucket}.passed|failed|total` (and optional notApplicable),
 * falls back to legacy `summary.{bucket}Passed|Failed|Total` (e.g. summary.browserAuditTotal).
 * @param {string} bucket - "browserAudit" | "codeAudit" | "manualAudit"
 */
export function pickAuditBucketMetrics(flat, bucket) {
  if (!flat || !bucket) {
    return { passed: NaN, failed: NaN, total: NaN };
  }
  var p = pickFlatMetricNumber(flat, "summary." + bucket + ".passed");
  var f = pickFlatMetricNumber(flat, "summary." + bucket + ".failed");
  var tot = pickFlatMetricNumber(flat, "summary." + bucket + ".total");
  var na = pickFlatMetricNumber(flat, "summary." + bucket + ".notApplicable");
  if (isFinite(p) && isFinite(f) && isFinite(tot) && tot > 0) {
    return { passed: p, failed: f, total: tot, notApplicable: isFinite(na) ? na : NaN };
  }
  var legP = pickFlatMetricNumber(flat, "summary." + bucket + "Passed");
  var legF = pickFlatMetricNumber(flat, "summary." + bucket + "Failed");
  var legT = pickFlatMetricNumber(flat, "summary." + bucket + "Total");
  if (isFinite(legP) && isFinite(legF) && isFinite(legT) && legT > 0) {
    return { passed: legP, failed: legF, total: legT, notApplicable: NaN };
  }
  return { passed: NaN, failed: NaN, total: NaN, notApplicable: NaN };
}

function totalsNearlyEqual(a, b) {
  return isFinite(a) && isFinite(b) && Math.abs(a - b) < 0.5;
}

/**
 * Builds stacked-bar segment model from flat summary.* keys (audit metrics schema).
 */
export function buildStackedDistributionModelFromFlat(flat, t) {
  var total = pickFlatMetricNumber(flat, "summary.overall.total");
  var passed = pickFlatMetricNumber(flat, "summary.overall.passed");
  var crit = pickFlatMetricNumber(flat, "summary.overall.criticalFailed");
  var high = pickFlatMetricNumber(flat, "summary.overall.highFailed");
  var med = pickFlatMetricNumber(flat, "summary.overall.mediumFailed");
  if (!(isFinite(total) && total > 0)) {
    total = pickFlatMetricNumber(flat, "summary.totalChecks");
    passed = pickFlatMetricNumber(flat, "summary.passed");
    crit = pickFlatMetricNumber(flat, "summary.criticalFailed");
    high = pickFlatMetricNumber(flat, "summary.highFailed");
    med = pickFlatMetricNumber(flat, "summary.mediumFailed");
  }
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
  var failed = pickFlatMetricNumber(flat, "summary.overall.failed");
  var na = pickFlatMetricNumber(flat, "summary.overall.notApplicable");
  if (!(isFinite(failed) && isFinite(na))) {
    failed = pickFlatMetricNumber(flat, "summary.failed");
    na = pickFlatMetricNumber(flat, "summary.notApplicable");
  }
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

/**
 * Groups `topIssues.{n}.phase|description|severity|evidence` into table rows (sorted by n).
 */
export function buildTopIssuesTableRowsFromFlat(flat) {
  var prefix = "topIssues.";
  var byIndex = {};
  if (!flat || typeof flat !== "object") return [];
  Object.keys(flat).forEach(function (key) {
    if (key.indexOf(prefix) !== 0) return;
    var rest = key.slice(prefix.length);
    var m = /^(\d+)\.(.+)$/.exec(rest);
    if (!m) return;
    var idx = m[1];
    var field = m[2];
    if (!byIndex[idx]) byIndex[idx] = {};
    var v = flat[key];
    byIndex[idx][field] = v == null ? "" : String(v);
  });
  return Object.keys(byIndex)
    .sort(function (a, b) {
      return Number(a) - Number(b);
    })
    .map(function (ix) {
      var r = byIndex[ix];
      return {
        phase: r.phase || "",
        description: r.description || "",
        severity: r.severity || "",
        evidence: r.evidence || "",
      };
    })
    .filter(function (r) {
      return r.phase || r.description || r.severity || r.evidence;
    });
}

/**
 * Groups `components.{n}.name|path|failedChecks|criticalFailures|healthScore` into table rows.
 */
export function buildComponentsTableRowsFromFlat(flat) {
  var prefix = "components.";
  var byIndex = {};
  if (!flat || typeof flat !== "object") return [];
  Object.keys(flat).forEach(function (key) {
    if (key.indexOf(prefix) !== 0) return;
    var rest = key.slice(prefix.length);
    var m = /^(\d+)\.(.+)$/.exec(rest);
    if (!m) return;
    var idx = m[1];
    var field = m[2];
    if (!byIndex[idx]) byIndex[idx] = {};
    var v = flat[key];
    byIndex[idx][field] = v == null ? "" : String(v);
  });
  return Object.keys(byIndex)
    .sort(function (a, b) {
      return Number(a) - Number(b);
    })
    .map(function (ix) {
      var r = byIndex[ix];
      var crit =
        r.criticalFailures != null && r.criticalFailures !== ""
          ? r.criticalFailures
          : r.criticalFailure != null && r.criticalFailure !== ""
            ? r.criticalFailure
            : r.critical != null && r.critical !== ""
              ? r.critical
              : "";
      return {
        name: r.name || "",
        path: r.path || "",
        critical: crit,
        failedChecks: r.failedChecks != null && r.failedChecks !== "" ? r.failedChecks : "",
        healthScore: r.healthScore != null && r.healthScore !== "" ? r.healthScore : "",
      };
    })
    .filter(function (row) {
      return row.name || row.path || row.critical || row.failedChecks || row.healthScore;
    });
}

/**
 * Builds horizontal bar chart rows from flat `scores.*` (excludes `scores.overall`).
 * Sorted by value descending; labels from metrics helpers.
 * @param {Record<string, unknown>} flat
 * @param {{ formatMetricRestPathLabel: (p: string) => string }} M
 */
export function buildScoresBarChartItemsFromFlat(flat, M) {
  if (!flat || typeof flat !== "object" || !M) return [];
  var prefix = "scores.";
  var rows = [];
  Object.keys(flat).forEach(function (key) {
    if (key.indexOf(prefix) !== 0) return;
    var rest = key.slice(prefix.length);
    if (!rest || rest === "overall") return;
    var n = Number(flat[key]);
    if (!isFinite(n)) return;
    rows.push({ restPath: rest, value: n });
  });
  rows.sort(function (a, b) {
    return b.value - a.value;
  });
  return rows.map(function (r, i) {
    return {
      label: M.formatMetricRestPathLabel(r.restPath) || r.restPath,
      value: r.value,
      color: SCORES_BAR_PALETTE[i % SCORES_BAR_PALETTE.length],
    };
  });
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
    /* Detail metrics for these audits are summarized in the Summary donuts; skip duplicate pillar cards. */
    if (cat === "browser" || cat === "code" || cat === "manual") return;

    if (cat === "topIssues") {
      var issueRows = buildTopIssuesTableRowsFromFlat(flat);
      if (!issueRows.length) return;
      var tiTitle = M.humanizeSegment(cat);
      var tiAria = t("metrics.openCategory", { name: tiTitle });
      cards.push({
        kind: "issuesTable",
        categoryKey: cat,
        title: tiTitle,
        ariaLabel: tiAria,
        columns: [
          { key: "phase", label: t("metrics.topIssues.phase") },
          { key: "description", label: t("metrics.topIssues.description") },
          { key: "severity", label: t("metrics.topIssues.severity") },
          { key: "evidence", label: t("metrics.topIssues.evidence") },
        ],
        rows: issueRows,
      });
      return;
    }

    if (cat === "components") {
      var compRows = buildComponentsTableRowsFromFlat(flat);
      if (!compRows.length) return;
      var compTitle = M.humanizeSegment(cat);
      var compAria = t("metrics.openCategory", { name: compTitle });
      cards.push({
        kind: "issuesTable",
        categoryKey: cat,
        title: compTitle,
        ariaLabel: compAria,
        columns: [
          { key: "name", label: t("metrics.components.name") },
          { key: "path", label: t("metrics.components.path") },
          { key: "critical", label: t("metrics.components.critical") },
          { key: "failedChecks", label: t("metrics.components.failedChecks") },
          { key: "healthScore", label: t("metrics.components.healthScore") },
        ],
        rows: compRows,
      });
      return;
    }

    if (cat === "scores") {
      var scoreBarItems = buildScoresBarChartItemsFromFlat(flat, M);
      if (!scoreBarItems.length) return;
      var scoresTitle = M.humanizeSegment(cat);
      var scoresAria = t("metrics.openCategory", { name: scoresTitle });
      cards.push({
        kind: "scoresBarChart",
        categoryKey: cat,
        title: scoresTitle,
        ariaLabel: scoresAria,
        scoresBarChart: {
          items: scoreBarItems,
          xMax: 100,
          tickStep: 10,
          legendColumns: 1,
        },
      });
      return;
    }

    var rows = grouped[cat].filter(function (row) {
      if (cat === "overallStatus" && row.restPath === "ragRating") return false;
      if (
        cat === "status" &&
        (row.restPath === "ragRating" || row.restPath === "goLiveReady")
      ) {
        return false;
      }
      return true;
    });
    if (!rows.length) return;

    var displayName = cat === "_root" ? t("metrics.uncategorized") : M.humanizeSegment(cat);
    var ariaLabel = t("metrics.openCategory", { name: displayName });

    if (cat === "summary") {
      var stackedModel = buildStackedDistributionModelFromFlat(flat, t);
      var browserB = pickAuditBucketMetrics(flat, "browserAudit");
      var codeB = pickAuditBucketMetrics(flat, "codeAudit");
      var manualB = pickAuditBucketMetrics(flat, "manualAudit");
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
                passed: browserB.passed,
                failed: browserB.failed,
                total: browserB.total,
              },
              {
                title: t("metrics.summary.codeAuditTitle"),
                passed: codeB.passed,
                failed: codeB.failed,
                total: codeB.total,
              },
              {
                title: t("metrics.summary.manualAuditTitle"),
                passed: manualB.passed,
                failed: manualB.failed,
                total: manualB.total,
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
      var num = Number(r.value);
      var scoreLike = M.isScoreLikeMetric(r.restPath, r.fullKey) && isFinite(num);
      var ts = M.metricRowTitleAndSubtitle(r.restPath);
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

    var pillarCard = {
      kind: "pillars",
      categoryKey: cat,
      title: displayName,
      ariaLabel: ariaLabel,
      rows: pillarRows,
    };
    if (cat === "risk" || cat === "riskIndex") {
      pillarCard.pillarsLayout = { variant: "twoColumn" };
    }
    cards.push(pillarCard);
  });

  return { drillGroups: grouped, cards: cards };
}
