/**
 * Minimal issues / data table: horizontal rules only, uppercase headers.
 * @param {HTMLElement} parent
 * @param {{
 *   columns: { key: string, label: string }[],
 *   rows: Record<string, string>[],
 * }} config
 */
export function appendIssuesTable(parent, config) {
  if (!parent || !config || !Array.isArray(config.columns) || !Array.isArray(config.rows)) {
    return;
  }

  var wrap = document.createElement("div");
  wrap.className = "pc-issues-table-wrap";

  var table = document.createElement("table");
  table.className = "pc-issues-table";
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
  table.appendChild(tbody);

  wrap.appendChild(table);
  parent.appendChild(wrap);
}
