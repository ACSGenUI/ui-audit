export const PILLAR_ROW_SVGS = [
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 9v12" /></svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="3" /><path d="M6 20v-2a4 4 0 014-4h4a4 4 0 014 4v2M12 11v4" /></svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" /></svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 18l6-6-6-6M8 6L2 12l6 6" /></svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 12l2 2 4-4" /></svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>',
];

var riskSvgOpen =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

/** Line icons for risk pillar rows (High / Medium / Low); circular wash applied via CSS. */
export const RISK_PILLAR_ICONS = {
  high:
    riskSvgOpen +
    "<path d=\"M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z\"/><path d=\"M12 9v4M12 17h.01\"/></svg>",
  medium: riskSvgOpen + '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>',
  low: riskSvgOpen + '<circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>',
};

export function layoutCategoryCard(options) {
  var card = document.createElement("article");
  card.className = "metric-category-card";
  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "0");
  card.dataset.category = options.categoryKey;
  card.setAttribute("aria-label", options.ariaLabel);
  return card;
}

export function layoutCategoryHeading(text) {
  var h = document.createElement("h3");
  h.className = "metric-category-card__title";
  h.textContent = text;
  return h;
}

export function layoutCompositeShell() {
  var shell = document.createElement("div");
  shell.className = "metric-composite-shell";
  shell.setAttribute("role", "presentation");
  return shell;
}

export function layoutDonutsRow() {
  var row = document.createElement("div");
  row.className = "metric-composite-donuts";
  return row;
}

/**
 * @param {{ variant?: "default" | "twoColumn" } | undefined} options - twoColumn = 2-column grid of pillar rows.
 */
export function layoutPillarsStack(options) {
  var el = document.createElement("div");
  el.className = "metric-category-pillars";
  if (options && options.variant === "twoColumn") {
    el.classList.add("metric-category-pillars--cols-2");
  }
  return el;
}

/**
 * @param {{
 *   iconIndex?: number,
 *   title: string,
 *   subtitle?: string,
 *   valueText: string,
 *   scoreLike?: boolean,
 *   riskLevel?: "high" | "medium" | "low" | null,
 * }} options
 */
export function layoutPillarRow(options) {
  var svgs = PILLAR_ROW_SVGS;
  var rawIdx = Number(options.iconIndex);
  var idx = isFinite(rawIdx) ? Math.abs(Math.floor(rawIdx)) % svgs.length : 0;
  var riskLevel = options.riskLevel;
  var isRisk =
    riskLevel === "high" || riskLevel === "medium" || riskLevel === "low";
  var row = document.createElement("div");
  row.className = "row metric-category-pillar" + (isRisk ? " metric-category-pillar--risk" : "");
  var iconBox = document.createElement("div");
  iconBox.className = "icon-box";
  if (isRisk) {
    iconBox.classList.add("icon-box--risk", "icon-box--risk-" + riskLevel);
    iconBox.innerHTML = RISK_PILLAR_ICONS[riskLevel] || svgs[idx];
  } else {
    iconBox.style.background = "var(--icon-row-" + (idx + 1) + ")";
    iconBox.innerHTML = svgs[idx];
  }
  var body = document.createElement("div");
  body.className = "row-body";
  var head = document.createElement("div");
  head.className = "row-head";
  var titles = document.createElement("div");
  titles.className = "row-titles";
  var titleEl = document.createElement("div");
  titleEl.className = "row-title";
  titleEl.textContent = options.title;
  var subEl = document.createElement("div");
  subEl.className = "row-sub";
  if (options.subtitle) {
    subEl.textContent = options.subtitle;
  } else {
    subEl.hidden = true;
  }
  titles.appendChild(titleEl);
  titles.appendChild(subEl);
  var valEl = document.createElement("div");
  valEl.className = "row-value" + (isRisk ? " row-value--risk-pill row-value--risk-pill--" + riskLevel : "");
  valEl.textContent = options.valueText;
  head.appendChild(titles);
  head.appendChild(valEl);
  body.appendChild(head);
  if (options.scoreLike) {
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
  return row;
}
