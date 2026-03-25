/**
 * Minimal issues / data table: horizontal rules only, uppercase headers.
 * @param {HTMLElement} parent
 * @param {{
 *   columns: { key: string, label: string }[],
 *   rows: Record<string, string>[],
 *   variant?: "components" | "topIssues",
 * }} config
 */
export function appendIssuesTable(parent, config) {
  if (!parent || !config || !Array.isArray(config.columns) || !Array.isArray(config.rows)) {
    return;
  }

  var variant =
    config.variant === "components"
      ? "components"
      : config.variant === "topIssues"
        ? "topIssues"
        : null;

  var wrap = document.createElement("div");
  wrap.className =
    "pc-issues-table-wrap" +
    (variant === "components"
      ? " pc-issues-table-wrap--components"
      : variant === "topIssues"
        ? " pc-issues-table-wrap--top-issues"
        : "");

  var table = document.createElement("table");
  table.className =
    "pc-issues-table" +
    (variant === "components"
      ? " pc-issues-table--components"
      : variant === "topIssues"
        ? " pc-issues-table--top-issues"
        : "");
  table.setAttribute("role", "table");

  var thead = document.createElement("thead");
  var hr = document.createElement("tr");
  config.columns.forEach(function (col) {
    var th = document.createElement("th");
    th.scope = "col";
    th.textContent = col.label != null ? String(col.label) : col.key;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  var tbody = document.createElement("tbody");
  if (variant === "components") {
    config.rows.forEach(function (row) {
      var tr = document.createElement("tr");
      config.columns.forEach(function (col) {
        var td = document.createElement("td");
        if (col.key === "name") {
          appendComponentCompositeCell(td, row);
        } else if (col.key === "failedChecks") {
          appendCountMetricCell(td, row.failedChecks, "failed");
        } else if (col.key === "critical") {
          appendCountMetricCell(td, row.critical, "critical");
        } else if (col.key === "healthScore") {
          appendHealthCell(td, row.healthScore);
        } else {
          var v = row[col.key];
          td.textContent = v != null && v !== "" ? String(v) : "—";
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  } else if (variant === "topIssues") {
    config.rows.forEach(function (row) {
      var tr = document.createElement("tr");
      config.columns.forEach(function (col) {
        var td = document.createElement("td");
        if (col.key === "severity") {
          appendTopIssueSeverityCell(td, row.severity);
        } else if (col.key === "description") {
          appendTopIssueDescriptionCell(td, row.description, row.subGroup);
        } else if (col.key === "location") {
          appendTopIssueLocationCell(td, row.locationPath, row.locationSubline);
        } else if (col.key === "phase") {
          appendTopIssueCategoryCell(td, row.phase);
        } else {
          var v2 = row[col.key];
          td.textContent = v2 != null && v2 !== "" ? String(v2) : "—";
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  } else {
    config.rows.forEach(function (row) {
      var tr = document.createElement("tr");
      config.columns.forEach(function (col) {
        var td = document.createElement("td");
        var v = row[col.key];
        td.textContent = v != null && v !== "" ? String(v) : "—";
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }
  table.appendChild(tbody);

  wrap.appendChild(table);
  parent.appendChild(wrap);
}

function severityTier(raw) {
  var s = String(raw == null ? "" : raw).trim().toLowerCase();
  if (s === "critical" || s === "crit") return "critical";
  if (s === "high") return "high";
  if (s === "medium" || s === "med" || s === "moderate") return "medium";
  if (s === "low") return "low";
  return "unknown";
}

function titleCaseSeverity(raw) {
  var s = String(raw == null ? "" : raw).trim();
  if (!s) return "";
  return s.replace(/\w\S*/g, function (w) {
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });
}

function appendTopIssueSeverityCell(td, raw) {
  td.className = "pc-issues-td-severity";
  var tier = severityTier(raw);
  var label = titleCaseSeverity(raw) || "—";
  var wrap = document.createElement("span");
  wrap.className = "pc-issues-severity pc-issues-severity--" + tier;

  var glyph = document.createElement("span");
  glyph.className = "pc-issues-severity__glyph";
  glyph.setAttribute("aria-hidden", "true");
  if (tier === "high" || tier === "medium") {
    glyph.innerHTML =
      '<svg viewBox="0 0 14 14" width="11" height="11" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M7 2L12.5 11H1.5L7 2Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="currentColor" fill-opacity="0.15"/>' +
      '<path d="M7 5.5V8M7 9.2h.01" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>' +
      "</svg>";
  } else if (tier === "low") {
    glyph.innerHTML =
      '<svg viewBox="0 0 14 14" width="11" height="11" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.2" fill="currentColor" fill-opacity="0.12"/>' +
      '<circle cx="7" cy="7" r="1.35" fill="currentColor"/>' +
      "</svg>";
  } else if (tier === "critical") {
    glyph.innerHTML =
      '<svg viewBox="0 0 14 14" width="11" height="11" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.2" fill="currentColor" fill-opacity="0.12"/>' +
      '<line x1="4" y1="7" x2="10" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
      "</svg>";
  } else {
    glyph.innerHTML =
      '<svg viewBox="0 0 14 14" width="11" height="11" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.7"/>' +
      '<circle cx="7" cy="7" r="1.5" fill="currentColor"/>' +
      "</svg>";
  }

  var text = document.createElement("span");
  text.className = "pc-issues-severity__text";
  text.textContent = label;

  wrap.appendChild(glyph);
  wrap.appendChild(text);
  td.appendChild(wrap);
}

function appendTopIssueDescriptionCell(td, body, sub) {
  td.className = "pc-issues-td-desc";
  var wrap = document.createElement("div");
  wrap.className = "pc-issues-desc-stack";
  var main = document.createElement("span");
  main.className = "pc-issues-desc-main";
  main.textContent = body != null && body !== "" ? String(body) : "—";
  wrap.appendChild(main);
  var subStr = sub != null ? String(sub).trim() : "";
  if (subStr) {
    var subEl = document.createElement("span");
    subEl.className = "pc-issues-desc-sub";
    subEl.textContent = subStr;
    wrap.appendChild(subEl);
  }
  td.appendChild(wrap);
}

function appendTopIssueLocationCell(td, pathRaw, subline) {
  td.className = "pc-issues-td-location";
  var path = pathRaw != null ? String(pathRaw).trim() : "";
  if (!path) {
    td.textContent = "—";
    return;
  }
  var stack = document.createElement("div");
  stack.className = "pc-issues-location-stack";
  var titleEl = document.createElement("span");
  titleEl.className = "pc-issues-location-path";
  titleEl.textContent = path;
  stack.appendChild(titleEl);
  var sub = subline != null ? String(subline).trim() : "";
  if (sub) {
    var subEl = document.createElement("span");
    subEl.className = "pc-issues-location-linehint";
    subEl.textContent = sub;
    stack.appendChild(subEl);
  }
  td.appendChild(stack);
}

function appendTopIssueCategoryCell(td, raw) {
  td.className = "pc-issues-td-category";
  var s = raw != null ? String(raw).trim() : "";
  if (!s) {
    td.textContent = "—";
    return;
  }
  var pill = document.createElement("span");
  pill.className = "pc-issues-category-pill";
  pill.textContent = s;
  td.appendChild(pill);
}

function appendComponentCompositeCell(td, row) {
  var name = row.name != null ? String(row.name) : "";
  var path = row.path != null ? String(row.path) : "";
  td.className = "pc-issues-td-component";

  var cell = document.createElement("div");
  cell.className = "pc-issues-component-cell";

  var iconWrap = document.createElement("span");
  iconWrap.className = "pc-issues-component-icon";
  iconWrap.setAttribute("aria-hidden", "true");
  iconWrap.innerHTML =
    '<svg class="pc-issues-component-icon-svg" viewBox="0 0 40 44" width="26" height="29" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M8 4h18l10 10v26a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2z" fill="var(--pc-issues-file-fill, #f1f5f9)" stroke="currentColor" stroke-width="1.25"/>' +
    '<path d="M26 4v10h10" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>' +
    "</svg>";

  var text = document.createElement("span");
  text.className = "pc-issues-component-text";
  var titleEl = document.createElement("span");
  titleEl.className = "pc-issues-component-title";
  titleEl.textContent = name || "—";
  text.appendChild(titleEl);
  if (path) {
    var pathEl = document.createElement("span");
    pathEl.className = "pc-issues-component-path";
    pathEl.textContent = path;
    text.appendChild(pathEl);
  }

  cell.appendChild(iconWrap);
  cell.appendChild(text);
  td.appendChild(cell);
}

function appendCountMetricCell(td, raw, kind) {
  td.className = "pc-issues-td-metric";
  var n = Number(raw);
  var hasNum = isFinite(n);
  var wrap = document.createElement("div");
  wrap.className = "pc-issues-metric pc-issues-metric--" + kind;

  if (hasNum) {
    var icon = document.createElement("span");
    icon.className = "pc-issues-metric-icon";
    icon.setAttribute("aria-hidden", "true");
    if (kind === "failed") {
      icon.innerHTML =
        '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="8" cy="8" r="7" fill="#ef4444"/>' +
        '<path d="M5 5l6 6M11 5l-6 6" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>' +
        "</svg>";
    } else {
      icon.innerHTML =
        '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="8" cy="8" r="7" fill="#ef4444"/>' +
        '<path d="M8 4.5v5.2M8 11.2h.01" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>' +
        "</svg>";
    }
    wrap.appendChild(icon);
    var val = document.createElement("span");
    val.className = "pc-issues-metric-value";
    val.textContent = String(Math.round(n));
    wrap.appendChild(val);
  } else {
    wrap.className += " pc-issues-metric--empty";
    wrap.textContent = "—";
  }

  td.appendChild(wrap);
}

function appendHealthCell(td, raw) {
  td.className = "pc-issues-td-health";
  var n = Number(raw);
  var pct = isFinite(n) ? Math.max(0, Math.min(100, n)) : NaN;
  var wrap = document.createElement("div");
  wrap.className = "pc-issues-health";

  if (!isFinite(pct)) {
    wrap.className += " pc-issues-health--empty";
    wrap.textContent = "—";
    td.appendChild(wrap);
    return;
  }

  var tier = pct >= 70 ? "good" : pct >= 40 ? "warn" : "low";
  wrap.className += " pc-issues-health--" + tier;

  var track = document.createElement("div");
  track.className = "pc-issues-health-track";
  var fill = document.createElement("div");
  fill.className = "pc-issues-health-fill";
  fill.style.width = pct + "%";
  track.appendChild(fill);

  var score = document.createElement("span");
  score.className = "pc-issues-health-score";
  score.textContent = String(Math.round(pct));

  wrap.appendChild(track);
  wrap.appendChild(score);
  td.appendChild(wrap);
}
