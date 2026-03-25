import { scoreTierClass, formatPassedTotalLabel } from '../utils/score.js';

export function syncRowProgressUi(row, passed, total, env) {
  env = env || {};
  var tr = env.t || function (key) {
    return key;
  };
  var numberLocaleTag = env.numberLocaleTag || function () {
    return "en-US";
  };
  var valEl = row.querySelector(".row-value");
  var scoreNum = valEl ? Number(String(valEl.textContent).replace(/[^0-9.-]/g, "")) : NaN;
  var tier = scoreTierClass(isFinite(scoreNum) ? scoreNum : 0);
  var meta = row.querySelector(".row-passed-total");
  var hint = row.querySelector(".row-progress-hint");
  var fill = row.querySelector(".row-progress-fill");
  var progressRoot = row.querySelector(".row-progress");
  if (meta) meta.textContent = formatPassedTotalLabel(passed, total, numberLocaleTag);
  if (hint) hint.textContent = tr("domain.passedTotalHint");
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
      tr("domain.rowProgressAria", { passed: String(passed), total: String(total) })
    );
  }
}
