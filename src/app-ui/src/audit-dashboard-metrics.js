/**
 * Flat EDS-style metrics: keys like "summary.totalChecks", "metadata.projectName".
 * Groups by first path segment (category) and helpers for the dashboard.
 *
 * DEFAULT_AUDIT_METRICS — null when no MCP/query payload is present (dashboard shows empty state).
 * Real metrics are always supplied via the MCP tool payload or ?data= query param.
 *
 * CATEGORY_ORDER — card sort order; first segment of each key.
 */
  var CATEGORY_ORDER = [
    "metadata",
    "summary",
    "scores",
    "status",
    "risk",
    "trend",
    "topIssues",
    "components",
  ];

  var DEFAULT_AUDIT_METRICS = null;

  function getFlatMetricsFromPayload(payload) {
    if (!payload || typeof payload !== "object") return null;
    var m = payload.metrics;
    if (m && typeof m === "object" && !Array.isArray(m) && Object.keys(m).length > 0) {
      return m;
    }
    return null;
  }

  function groupMetricsByCategory(flat) {
    var groups = {};
    if (!flat || typeof flat !== "object") return groups;

    Object.keys(flat).forEach(function (key) {
      var parts = key.split(".");
      var category = parts.length > 1 ? parts[0] : "_root";
      var restPath = parts.length > 1 ? parts.slice(1).join(".") : key;
      if (!groups[category]) groups[category] = [];
      groups[category].push({
        fullKey: key,
        restPath: restPath,
        value: flat[key],
      });
    });

    Object.keys(groups).forEach(function (cat) {
      groups[cat].sort(function (a, b) {
        return a.restPath.localeCompare(b.restPath, undefined, { numeric: true, sensitivity: "base" });
      });
    });

    return groups;
  }

  function humanizeSegment(segment) {
    if (!segment) return "";
    var s = String(segment).replace(/([a-z])([A-Z])/g, "$1 $2");
    s = s.replace(/[-_]/g, " ");
    s = s.replace(/\./g, " · ");
    return s.replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
  }

  function splitRestPathSegments(restPath) {
    if (restPath == null || restPath === "") return [];
    return String(restPath).split(".");
  }

  /** Labels like `Accessibility · Score` for flat keys `domains.accessibility.score`. */
  function formatMetricRestPathLabel(restPath) {
    return splitRestPathSegments(restPath)
      .map(function (part) {
        return humanizeSegment(part);
      })
      .join(" · ");
  }

  function metricRowTitleAndSubtitle(restPath) {
    var parts = splitRestPathSegments(restPath);
    if (!parts.length) return { title: "", subtitle: "" };
    if (parts.length === 1) {
      return { title: humanizeSegment(parts[0]), subtitle: "" };
    }
    return {
      title: humanizeSegment(parts[0]),
      subtitle: parts
        .slice(1)
        .map(function (p) {
          return humanizeSegment(p);
        })
        .join(" · "),
    };
  }

  /** Percent-style metrics (0–100) that get a progress bar and derived passed/total. */
  function isScoreLikeMetric(restPath, fullKey) {
    if (fullKey && typeof fullKey === "string" && /^scores\./.test(fullKey)) return true;
    var last = fullKey && typeof fullKey === "string" ? fullKey.split(".").pop() : "";
    if (restPath && /(score|passrate|failrate)$/i.test(restPath)) return true;
    if (last && /(score|passrate|failrate)$/i.test(last)) return true;
    return false;
  }

  function sortCategoryNames(names) {
    return names.slice().sort(function (a, b) {
      if (a === "_root") return 1;
      if (b === "_root") return -1;
      var ia = CATEGORY_ORDER.indexOf(a);
      var ib = CATEGORY_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }

  var DONUT_PALETTE = ["#e9d5ff", "#d9f99d", "#a5f3fc", "#fde68a", "#fbcfe8", "#cbd5e1", "#fda4af", "#93c5fd"];

  /** Pillar keys under `scores.*` for the main compliance donut (avoids dozens of phase scores). */
  var SCORE_DONUT_SLICE_ORDER = [
    "htmlImplementation",
    "cssImplementation",
    "javascriptImplementation",
    "accessibility",
    "performance",
    "codeQuality",
    "security",
    "processGovernance",
  ];

  function buildDonutSlicesFromFlat(flat) {
    var slices = [];
    var center = null;

    if (!flat) {
      return { slices: [], center: null };
    }

    var coRaw = flat["scores.overall"];
    if (coRaw !== undefined && coRaw !== null && coRaw !== "") {
      var cn = Number(coRaw);
      if (isFinite(cn)) center = cn;
    }

    var sliceIdx = 0;
    SCORE_DONUT_SLICE_ORDER.forEach(function (sk) {
      var key = "scores." + sk;
      if (!Object.prototype.hasOwnProperty.call(flat, key)) return;
      var raw = flat[key];
      if (raw === "" || raw == null) return;
      var n = Number(raw);
      if (!isFinite(n)) return;
      slices.push({
        title: humanizeSegment(sk),
        value: Math.max(0, n),
        color: DONUT_PALETTE[sliceIdx++ % DONUT_PALETTE.length],
      });
    });

    if (center != null || slices.length > 0) {
      if (center == null) {
        var legCenter = flat["overallScores.uiQualityScore"];
        if (legCenter !== undefined && legCenter !== null && legCenter !== "") {
          var lc = Number(legCenter);
          if (isFinite(lc)) center = lc;
        }
      }
      return { slices: slices, center: center != null && isFinite(center) ? center : null };
    }

    var prefix = "overallScores.";
    Object.keys(flat).forEach(function (k) {
      if (k.indexOf(prefix) !== 0) return;
      var suffix = k.slice(prefix.length);
      if (!/Score$/i.test(suffix)) return;
      var raw = flat[k];
      if (raw === "" || raw == null) return;
      var n = Number(raw);
      if (!isFinite(n)) return;

      if (suffix === "uiQualityScore") {
        center = n;
        return;
      }

      var label = humanizeSegment(suffix.replace(/Score$/i, ""));
      slices.push({
        title: label,
        value: Math.max(0, n),
        color: DONUT_PALETTE[slices.length % DONUT_PALETTE.length],
      });
    });

    return { slices: slices, center: center != null && isFinite(center) ? center : null };
  }

  function pickMetadataEntries(flat) {
    var prefix = "metadata.";
    var list = [];
    if (!flat) return list;
    Object.keys(flat).forEach(function (k) {
      if (k.indexOf(prefix) !== 0) return;
      var rest = k.slice(prefix.length);
      list.push({ key: k, restPath: rest, value: flat[k] });
    });
    list.sort(function (a, b) {
      return a.restPath.localeCompare(b.restPath);
    });
    return list;
  }

  function getMetadataMap(flat) {
    var map = {};
    pickMetadataEntries(flat).forEach(function (e) {
      map[e.restPath] = e.value;
    });
    return map;
  }

const AuditDashboardMetrics = {
  DEFAULT_AUDIT_METRICS: DEFAULT_AUDIT_METRICS,
  CATEGORY_ORDER: CATEGORY_ORDER,
  SCORE_DONUT_SLICE_ORDER: SCORE_DONUT_SLICE_ORDER,
  getFlatMetricsFromPayload: getFlatMetricsFromPayload,
  groupMetricsByCategory: groupMetricsByCategory,
  humanizeSegment: humanizeSegment,
  splitRestPathSegments: splitRestPathSegments,
  formatMetricRestPathLabel: formatMetricRestPathLabel,
  metricRowTitleAndSubtitle: metricRowTitleAndSubtitle,
  isScoreLikeMetric: isScoreLikeMetric,
  sortCategoryNames: sortCategoryNames,
  buildDonutSlicesFromFlat: buildDonutSlicesFromFlat,
  pickMetadataEntries: pickMetadataEntries,
  getMetadataMap: getMetadataMap,
  DONUT_PALETTE: DONUT_PALETTE,
};
globalThis.AuditDashboardMetrics = AuditDashboardMetrics;

export default AuditDashboardMetrics;
export {
  DEFAULT_AUDIT_METRICS,
  CATEGORY_ORDER,
  SCORE_DONUT_SLICE_ORDER,
  getFlatMetricsFromPayload,
  groupMetricsByCategory,
  humanizeSegment,
  splitRestPathSegments,
  formatMetricRestPathLabel,
  metricRowTitleAndSubtitle,
  isScoreLikeMetric,
  sortCategoryNames,
  buildDonutSlicesFromFlat,
  pickMetadataEntries,
  getMetadataMap,
  DONUT_PALETTE,
};
