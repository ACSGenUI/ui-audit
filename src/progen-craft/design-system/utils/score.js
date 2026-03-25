export function scoreTierClass(score) {
  var numericScore = Number(score);
  if (!isFinite(numericScore)) return "score-tier-neutral";
  if (numericScore < 40) return "score-tier-red";
  if (numericScore < 90) return "score-tier-amber";
  return "score-tier-green";
}

export function clampPct(value) {
  if (!isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function resolvePassedTotal(domain) {
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

export function formatPassedTotalLabel(passed, total, numberLocaleTag) {
  var loc = typeof numberLocaleTag === "function" ? numberLocaleTag() : "en-US";
  return passed.toLocaleString(loc) + "/" + total.toLocaleString(loc);
}
