/**
 * Horizontal bar chart with optional Y indices, X grid, and multi-column legend.
 * @param {HTMLElement} parent
 * @param {{
 *   items: { label: string, value: number, color?: string }[],
 *   xMax?: number,
 *   tickStep?: number,
 *   showGrid?: boolean,
 *   showRowIndex?: boolean,
 *   legendColumns?: number, // default 1 (compact single column in right rail)
 *   showLegend?: boolean,
 *   hideLegend?: boolean, // app-friendly alias: when true, legend is omitted (chart uses full width)
 *   showBarValueOnHover?: boolean, // default true when legend hidden: show % in a hover tip on each row
 *   formatValue?: (n: number) => string,
 *   formatBarHoverTitle?: (item: { label: string, value: number }, formatValue: (n: number) => string) => string,
 *   minBarLabelWidthPct?: number,
 *   ariaLabel?: string,
 * }} config
 */
export function appendScoresBarChart(parent, config) {
  if (!parent || !config || !Array.isArray(config.items) || !config.items.length) {
    return;
  }

  var items = config.items;
  var xMax = config.xMax != null && isFinite(config.xMax) && config.xMax > 0 ? Number(config.xMax) : 100;
  var tickStep = config.tickStep != null && config.tickStep > 0 ? Number(config.tickStep) : 10;
  var showGrid = config.showGrid !== false;
  var showRowIndex = config.showRowIndex !== false;
  var legendCols = config.legendColumns != null ? Math.max(1, Math.floor(Number(config.legendColumns))) : 1;
  var showLegend = config.hideLegend === true ? false : config.showLegend !== false;
  var showBarHover =
    config.showBarValueOnHover === true
      ? true
      : config.showBarValueOnHover === false
        ? false
        : !showLegend;
  var formatVal =
    typeof config.formatValue === "function"
      ? config.formatValue
      : function (n) {
          return String(Math.round(Number(n) * 10) / 10) + "%";
        };
  var minInsidePct =
    config.minBarLabelWidthPct != null && isFinite(config.minBarLabelWidthPct)
      ? Number(config.minBarLabelWidthPct)
      : 14;

  var formatHoverTitle =
    typeof config.formatBarHoverTitle === "function"
      ? config.formatBarHoverTitle
      : function (it, fv) {
          return it.label + " · " + fv(Number(it.value));
        };

  var root = document.createElement("div");
  root.className = "pc-scores-bar-chart" + (!showLegend ? " pc-scores-bar-chart--no-legend" : "");
  if (showBarHover) {
    root.classList.add("pc-scores-bar-chart--hover-values");
  }
  if (config.ariaLabel) {
    root.setAttribute("aria-label", config.ariaLabel);
    if (!showBarHover) {
      root.setAttribute("role", "img");
    }
  }

  var main = document.createElement("div");
  main.className = "pc-scores-bar-chart__main" + (!showLegend ? " pc-scores-bar-chart__main--chart-only" : "");

  var chartCol = document.createElement("div");
  chartCol.className = "pc-scores-bar-chart__chart";

  var xRow = document.createElement("div");
  xRow.className = "pc-scores-bar-chart__x-row";
  var xPad = document.createElement("div");
  xPad.className = "pc-scores-bar-chart__x-row-pad";
  xPad.setAttribute("aria-hidden", "true");
  xRow.appendChild(xPad);
  var xLabels = document.createElement("div");
  xLabels.className = "pc-scores-bar-chart__x-labels";
  for (var xt = 0; xt <= xMax + 1e-9; xt += tickStep) {
    var xLab = document.createElement("span");
    xLab.className = "pc-scores-bar-chart__x-tick-label";
    xLab.style.left = (xt / xMax) * 100 + "%";
    xLab.textContent = formatVal(xt);
    xLabels.appendChild(xLab);
  }
  xRow.appendChild(xLabels);
  chartCol.appendChild(xRow);

  var body = document.createElement("div");
  body.className = "pc-scores-bar-chart__body";

  var plotWrap = document.createElement("div");
  plotWrap.className = "pc-scores-bar-chart__plot-wrap";

  if (showGrid) {
    var grid = document.createElement("div");
    grid.className = "pc-scores-bar-chart__grid";
    grid.setAttribute("aria-hidden", "true");
    for (var g = 0; g <= xMax + 1e-9; g += tickStep) {
      var line = document.createElement("div");
      line.className = "pc-scores-bar-chart__grid-line";
      line.style.left = (g / xMax) * 100 + "%";
      grid.appendChild(line);
    }
    plotWrap.appendChild(grid);
  }

  var rowsEl = document.createElement("div");
  rowsEl.className = "pc-scores-bar-chart__rows";

  var n = items.length;
  items.forEach(function (item, i) {
    var row = document.createElement("div");
    row.className = "pc-scores-bar-chart__row";

    if (showRowIndex) {
      var yIdx = document.createElement("span");
      yIdx.className = "pc-scores-bar-chart__y-index";
      yIdx.textContent = String(n - i);
      row.appendChild(yIdx);
    }

    var trackOuter = document.createElement("div");
    trackOuter.className =
      "pc-scores-bar-chart__track-outer" + (showBarHover ? " pc-scores-bar-chart__track-outer--hoverable" : "");
    var track = document.createElement("div");
    track.className = "pc-scores-bar-chart__track";
    var v = Math.max(0, Math.min(xMax, Number(item.value)));
    var pct = xMax > 0 ? (v / xMax) * 100 : 0;
    var bar = document.createElement("div");
    bar.className = "pc-scores-bar-chart__bar";
    bar.style.width = pct + "%";
    bar.style.background = item.color || "var(--focus-ring, #6366f1)";
    if (showBarHover) {
      row.setAttribute("title", formatHoverTitle(item, formatVal));
    }
    if (pct >= minInsidePct) {
      var inLab = document.createElement("span");
      inLab.className = "pc-scores-bar-chart__bar-label pc-scores-bar-chart__bar-label--inside";
      inLab.textContent = item.label;
      bar.appendChild(inLab);
    }
    track.appendChild(bar);
    if (pct < minInsidePct) {
      var outLab = document.createElement("span");
      outLab.className = "pc-scores-bar-chart__bar-label pc-scores-bar-chart__bar-label--outside";
      outLab.textContent = item.label;
      track.appendChild(outLab);
    }
    trackOuter.appendChild(track);
    if (showBarHover) {
      var tip = document.createElement("span");
      tip.className = "pc-scores-bar-chart__hover-tip";
      tip.textContent = formatVal(v);
      tip.setAttribute("aria-hidden", "true");
      if (pct >= 88) {
        tip.classList.add("pc-scores-bar-chart__hover-tip--flush-end");
      } else {
        tip.style.left = "calc(" + pct + "% + 8px)";
      }
      trackOuter.appendChild(tip);
    }
    row.appendChild(trackOuter);
    rowsEl.appendChild(row);
  });

  plotWrap.appendChild(rowsEl);
  body.appendChild(plotWrap);
  chartCol.appendChild(body);
  main.appendChild(chartCol);

  if (showLegend) {
    var leg = document.createElement("aside");
    leg.className = "pc-scores-bar-chart__legend";
    leg.style.setProperty("--pc-scores-legend-cols", String(legendCols));
    items.forEach(function (item) {
      var cell = document.createElement("div");
      cell.className = "pc-scores-bar-chart__legend-item";
      var dot = document.createElement("span");
      dot.className = "pc-scores-bar-chart__legend-dot";
      dot.style.background = item.color || "var(--focus-ring)";
      var text = document.createElement("div");
      text.className = "pc-scores-bar-chart__legend-text";
      var nameEl = document.createElement("span");
      nameEl.className = "pc-scores-bar-chart__legend-name";
      nameEl.textContent = item.label;
      var pctEl = document.createElement("span");
      pctEl.className = "pc-scores-bar-chart__legend-pct";
      pctEl.textContent = formatVal(item.value);
      text.appendChild(nameEl);
      text.appendChild(pctEl);
      cell.appendChild(dot);
      cell.appendChild(text);
      leg.appendChild(cell);
    });
    main.appendChild(leg);
  }

  root.appendChild(main);
  parent.appendChild(root);
}
