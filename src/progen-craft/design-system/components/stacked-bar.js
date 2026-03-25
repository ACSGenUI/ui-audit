/** Horizontal stacked distribution bar (segment model from host). */
export function appendStackedDistributionBar(parent, model, options) {
  var t = options.t;
  var formatPct =
    options.formatPercentLabel ||
    function (pct) {
      if (!isFinite(pct)) return "0";
      var rounded = Math.round(pct * 10) / 10;
      return Math.abs(rounded % 1) < 0.05 ? String(Math.round(rounded)) : String(rounded);
    };
  var sectionTitle = options.sectionTitle || t("metrics.summary.checklistDistribution");
  if (!model || !model.segments.length) return;
  var block = document.createElement("div");
  block.className = "pc-stacked-bar";
  var h4 = document.createElement("h4");
  h4.className = "pc-stacked-bar__title";
  h4.textContent = sectionTitle;
  var labelTrack = document.createElement("div");
  labelTrack.className = "pc-stacked-bar__label-track";
  var bar = document.createElement("div");
  bar.className = "pc-stacked-bar__segments";
  bar.setAttribute("role", "img");
  bar.setAttribute(
    "aria-label",
    sectionTitle +
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
      "pc-stacked-bar__label" +
      (idx === 0 ? " pc-stacked-bar__label--start" : " pc-stacked-bar__label--tick");
    lab.style.left = cumulative + "%";
    var dot = document.createElement("span");
    dot.className = "pc-stacked-bar__label-dot";
    dot.setAttribute("aria-hidden", "true");
    dot.style.backgroundColor = seg.color || "var(--border-table)";
    var labelText = document.createElement("span");
    labelText.className = "pc-stacked-bar__label-text";
    labelText.textContent = seg.label;
    lab.appendChild(dot);
    lab.appendChild(labelText);
    labelTrack.appendChild(lab);
    var segEl = document.createElement("div");
    segEl.className = "pc-stacked-bar__seg";
    /* flex-basis % so segment width matches data (width alone can collapse in flex row). */
    segEl.style.flex = "0 0 " + pct + "%";
    segEl.style.maxWidth = pct + "%";
    var fill = document.createElement("div");
    fill.className = "pc-stacked-bar__seg-fill " + (seg.textClass || "");
    fill.style.background = seg.color;
    var innerPct = document.createElement("span");
    innerPct.className = "pc-stacked-bar__seg-pct";
    innerPct.textContent = formatPct(pct) + "%";
    if (pct < 6 && seg.value > 0) innerPct.classList.add("pc-stacked-bar__seg-pct--hidden");
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
