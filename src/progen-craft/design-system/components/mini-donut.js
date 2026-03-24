import { sectorPath } from '../utils/geometry.js';
import { prefersReducedMotion } from '../utils/motion.js';

/** Full annulus as two 180° paths (single 360° SVG arcs are degenerate when start=end). */
function appendAnnulusTwoHalves(svg, cx, cy, r0, r1, className, delayForIndex) {
  var halves = [
    [-Math.PI / 2, Math.PI / 2],
    [Math.PI / 2, (3 * Math.PI) / 2],
  ];
  for (var h = 0; h < halves.length; h++) {
    var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", sectorPath(cx, cy, r0, r1, halves[h][0], halves[h][1]));
    p.setAttribute("class", className);
    if (typeof delayForIndex === "function") {
      p.style.setProperty("--donut-enter-delay", delayForIndex(h));
    }
    svg.appendChild(p);
  }
}

export function paintMiniDonutSvg(svg, sliceCounts) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  var cx = 50;
  var cy = 50;
  var r0 = 30;
  var r1 = 47;
  var gapRad = (2 * Math.PI * 1.5) / 360;
  var sum = 0;
  for (var i = 0; i < sliceCounts.length; i++) sum += Math.max(0, sliceCounts[i].count);
  if (sum <= 0) {
    appendAnnulusTwoHalves(
      svg,
      cx,
      cy,
      r0,
      r1,
      "donut-seg donut-seg--animate-in donut-slice--empty donut-slice--ring-half",
      function (idx) {
        return prefersReducedMotion() ? "0ms" : idx * 40 + "ms";
      }
    );
    return;
  }
  appendAnnulusTwoHalves(svg, cx, cy, r0, r1, "donut-slice--track donut-slice--ring-half");
  var trackEls = svg.querySelectorAll(".donut-slice--track");
  for (var te = 0; te < trackEls.length; te++) {
    trackEls[te].setAttribute("aria-hidden", "true");
  }

  var active = sliceCounts.filter(function (s) {
    return s.count > 0;
  });
  if (!active.length) return;
  /* One non-zero slice (e.g. 100% passed): use two semicircle annuli, not one 360° arc. */
  if (active.length === 1) {
    var only = active[0];
    var sliceKey = only.key || "slice";
    appendAnnulusTwoHalves(
      svg,
      cx,
      cy,
      r0,
      r1,
      "donut-seg donut-seg--animate-in donut-slice--" + sliceKey + " donut-slice--ring-half",
      function (idx) {
        return prefersReducedMotion() ? "0ms" : idx * 40 + "ms";
      }
    );
    return;
  }
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
    var sliceKey = active[j].key || "slice";
    path.setAttribute("class", "donut-seg donut-seg--animate-in donut-slice--" + sliceKey);
    path.style.setProperty("--donut-enter-delay", prefersReducedMotion() ? "0ms" : j * 40 + "ms");
    svg.appendChild(path);
  }
}

export function appendMiniDonutBreakdownCard(parent, options) {
  var t = options.t;
  var title = options.title;
  var passed = isFinite(Number(options.passed)) ? Math.max(0, Number(options.passed)) : 0;
  var failed = isFinite(Number(options.failed)) ? Math.max(0, Number(options.failed)) : 0;
  var total = isFinite(Number(options.total)) ? Math.max(0, Number(options.total)) : 0;
  if (total <= 0) total = passed + failed;
  var other = Math.max(0, total - passed - failed);
  var formatPct =
    options.formatPercentLabel ||
    function (pct) {
      if (!isFinite(pct)) return "0";
      var rounded = Math.round(pct * 10) / 10;
      return Math.abs(rounded % 1) < 0.05 ? String(Math.round(rounded)) : String(rounded);
    };

  var card = document.createElement("div");
  card.className = "pc-mini-donut-card";
  var h4 = document.createElement("h4");
  h4.className = "pc-mini-donut-card__title";
  h4.textContent = title;
  var wrap = document.createElement("div");
  wrap.className = "pc-mini-donut-wrap";
  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("class", "pc-mini-donut-svg");
  svg.setAttribute("role", "img");
  var ariaParts = [];
  if (total > 0) {
    ariaParts.push(t("insights.row.passed") + " " + passed, t("insights.row.failed") + " " + failed);
    if (other > 0) ariaParts.push(t("metrics.summary.otherSlice") + " " + other);
    ariaParts.push(t("insights.row.totalChecks") + " " + total);
  }
  svg.setAttribute("aria-label", title + (ariaParts.length ? ". " + ariaParts.join(", ") : ""));
  var sliceSpec = [
    { count: passed, key: "passed" },
    { count: failed, key: "failed" },
  ];
  if (other > 0) sliceSpec.push({ count: other, key: "other" });
  paintMiniDonutSvg(svg, sliceSpec);
  var center = document.createElement("div");
  center.className = "pc-mini-donut-center";
  var pctEl = document.createElement("span");
  pctEl.className = "pc-mini-donut-pct";
  var hintEl = document.createElement("span");
  hintEl.className = "pc-mini-donut-hint";
  hintEl.textContent = t("metrics.summary.passRateHint");
  if (total > 0) {
    pctEl.textContent = formatPct((100 * passed) / total) + "%";
  } else {
    pctEl.textContent = "—";
  }
  center.appendChild(pctEl);
  center.appendChild(hintEl);
  wrap.appendChild(svg);
  wrap.appendChild(center);
  var legend = document.createElement("div");
  legend.className = "pc-mini-donut-legend";
  function addLegendRow(label, colorVar, count, denom) {
    var col = document.createElement("div");
    col.className = "pc-mini-donut-legend__col";
    var lab = document.createElement("div");
    lab.className = "pc-mini-donut-legend__label";
    lab.textContent = label;
    var frac = denom > 0 ? count / denom : 0;
    var pctW = Math.min(100, Math.max(0, 100 * frac));
    var track = document.createElement("div");
    track.className = "pc-mini-donut-legend__pill-track";
    track.setAttribute("role", "presentation");
    var pillFill = document.createElement("div");
    pillFill.className = "pc-mini-donut-legend__pill-fill";
    pillFill.style.background = colorVar;
    pillFill.style.width = pctW + "%";
    track.appendChild(pillFill);
    var val = document.createElement("div");
    val.className = "pc-mini-donut-legend__pct";
    val.textContent = t("metrics.summary.pctLegend", { n: formatPct(100 * frac) });
    col.appendChild(lab);
    col.appendChild(track);
    col.appendChild(val);
    legend.appendChild(col);
  }
  if (total > 0) {
    addLegendRow(t("insights.row.passed"), "var(--pc-mini-donut-passed)", passed, total);
    addLegendRow(t("insights.row.failed"), "var(--pc-mini-donut-failed)", failed, total);
    if (other > 0) addLegendRow(t("metrics.summary.otherSlice"), "var(--pc-mini-donut-slice-3)", other, total);
  } else {
    var empty = document.createElement("div");
    empty.className = "pc-mini-donut-legend__empty";
    empty.textContent = "—";
    legend.appendChild(empty);
  }
  card.appendChild(h4);
  card.appendChild(wrap);
  card.appendChild(legend);
  parent.appendChild(card);
}
