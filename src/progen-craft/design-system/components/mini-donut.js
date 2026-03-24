import { sectorPath } from '../utils/geometry.js';
import { prefersReducedMotion } from '../utils/motion.js';

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
    var pathEmpty = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathEmpty.setAttribute("d", sectorPath(cx, cy, r0, r1, -Math.PI / 2, 1.5 * Math.PI));
    pathEmpty.setAttribute("fill", "var(--pc-mini-donut-empty)");
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
    path.setAttribute("fill", active[j].color || "#94a3b8");
    path.setAttribute("class", "donut-seg donut-seg--animate-in");
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
    { count: passed, color: "var(--pc-mini-donut-slice-1)" },
    { count: failed, color: "var(--pc-mini-donut-slice-2)" },
  ];
  if (other > 0) sliceSpec.push({ count: other, color: "var(--pc-mini-donut-slice-3)" });
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
    var pill = document.createElement("div");
    pill.className = "pc-mini-donut-legend__pill";
    pill.style.background = colorVar;
    var val = document.createElement("div");
    val.className = "pc-mini-donut-legend__pct";
    var frac = denom > 0 ? count / denom : 0;
    val.textContent = t("metrics.summary.pctLegend", { n: formatPct(100 * frac) });
    col.appendChild(lab);
    col.appendChild(pill);
    col.appendChild(val);
    legend.appendChild(col);
  }
  if (total > 0) {
    addLegendRow(t("insights.row.passed"), "var(--pc-mini-donut-slice-1)", passed, total);
    addLegendRow(t("insights.row.failed"), "var(--pc-mini-donut-slice-2)", failed, total);
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
