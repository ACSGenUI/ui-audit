/**
 * Progen Craft — Application framework
 * Config-driven view rendering on top of ProgenCraftDesignSystem layouts + atomic charts/widgets.
 * Host apps supply a declarative view model (layout + component bindings + resolved copy where needed).
 */
import { ProgenCraftDesignSystem as DS } from '../design-system/progen-craft-design-system.js';

function readPayload() {
  if (
    typeof globalThis.__UI_AUDIT_DASHBOARD__ === "object" &&
    globalThis.__UI_AUDIT_DASHBOARD__ !== null
  )
    return globalThis.__UI_AUDIT_DASHBOARD__;
  try {
    var raw = new URLSearchParams(globalThis.location.search).get("data");
    if (raw) return JSON.parse(decodeURIComponent(raw));
  } catch (payloadParseError) {
    /* ignore */
  }
  return null;
}

function defaultFormatPercentLabel(pct) {
  if (!isFinite(pct)) return "0";
  var rounded = Math.round(pct * 10) / 10;
  return Math.abs(rounded % 1) < 0.05 ? String(Math.round(rounded)) : String(rounded);
}

/**
 * Renders a metrics dashboard from a host-built view model.
 * @param {HTMLElement | null} root
 * @param {{ drillGroups?: object | null, cards: object[] } | null} viewModel
 * @param {{ t: Function, formatPercentLabel?: Function, numberLocaleTag?: Function }} env
 */
function renderDashboardView(root, viewModel, env) {
  if (!root || !viewModel || !Array.isArray(viewModel.cards)) return;
  env = env || {};
  var t = env.t || function (k) {
    return k;
  };
  var formatPercentLabel = typeof env.formatPercentLabel === "function" ? env.formatPercentLabel : defaultFormatPercentLabel;
  var numberLocaleTag = env.numberLocaleTag || function () {
    return "en-US";
  };

  root.innerHTML = "";
  globalThis.__METRICS_DRILL_GROUPS__ = viewModel.drillGroups != null ? viewModel.drillGroups : null;

  viewModel.cards.forEach(function (card) {
    if (card.kind === "composite") {
      var shell = DS.layouts.categoryCard({
        categoryKey: card.categoryKey,
        ariaLabel: card.ariaLabel,
      });
      shell.classList.add("metric-category-card--composite");
      shell.appendChild(DS.layouts.categoryHeading(card.title));
      var composite = DS.layouts.compositeShell();
      (card.sections || []).forEach(function (sec) {
        if (sec.kind === "donutRow" && sec.donuts && sec.donuts.length) {
          var dr = DS.layouts.donutsRow();
          sec.donuts.forEach(function (d) {
            DS.charts.appendMiniDonutBreakdownCard(dr, {
              t: t,
              title: d.title,
              passed: d.passed,
              failed: d.failed,
              total: d.total,
              formatPercentLabel: formatPercentLabel,
            });
          });
          composite.appendChild(dr);
        } else if (sec.kind === "stackedBar" && sec.model && sec.model.segments && sec.model.segments.length) {
          DS.charts.appendStackedDistributionBar(composite, sec.model, {
            t: t,
            formatPercentLabel: formatPercentLabel,
            sectionTitle: sec.sectionTitle,
          });
        }
      });
      shell.appendChild(composite);
      root.appendChild(shell);
      return;
    }
    if (card.kind === "scoresBarChart") {
      var scoresShell = DS.layouts.categoryCard({
        categoryKey: card.categoryKey,
        ariaLabel: card.ariaLabel,
      });
      scoresShell.classList.add("metric-category-card--scores");
      scoresShell.appendChild(DS.layouts.categoryHeading(card.title));
      var sbc = card.scoresBarChart && typeof card.scoresBarChart === "object" ? card.scoresBarChart : {};
      if (typeof DS.charts.appendScoresBarChart === "function") {
        DS.charts.appendScoresBarChart(scoresShell, {
          items: sbc.items || [],
          xMax: sbc.xMax,
          tickStep: sbc.tickStep,
          showGrid: sbc.showGrid,
          showRowIndex: sbc.showRowIndex,
          legendColumns: sbc.legendColumns,
          showLegend: sbc.showLegend,
          hideLegend: sbc.hideLegend,
          showBarValueOnHover: sbc.showBarValueOnHover,
          formatBarHoverTitle: sbc.formatBarHoverTitle,
          minBarLabelWidthPct: sbc.minBarLabelWidthPct,
          formatValue: function (n) {
            return formatPercentLabel(Number(n)) + "%";
          },
          ariaLabel: card.ariaLabel,
        });
      }
      root.appendChild(scoresShell);
      return;
    }
    if (card.kind === "issuesTable") {
      var issuesCard = DS.layouts.categoryCard({
        categoryKey: card.categoryKey,
        ariaLabel: card.ariaLabel,
      });
      issuesCard.classList.add("metric-category-card--issues");
      var issuesVariant =
        card.issuesTableVariant === "components"
          ? "components"
          : card.issuesTableVariant === "topIssues"
            ? "topIssues"
            : null;
      if (issuesVariant === "components") {
        issuesCard.classList.add("metric-category-card--components");
      }
      if (issuesVariant === "topIssues") {
        issuesCard.classList.add("metric-category-card--top-issues");
      }
      issuesCard.appendChild(DS.layouts.categoryHeading(card.title));
      if (typeof DS.widgets.appendIssuesTable === "function") {
        DS.widgets.appendIssuesTable(issuesCard, {
          columns: card.columns || [],
          rows: card.rows || [],
          variant: issuesVariant || undefined,
        });
      }
      root.appendChild(issuesCard);
      return;
    }
    if (card.kind === "pillars") {
      var cardEl = DS.layouts.categoryCard({
        categoryKey: card.categoryKey,
        ariaLabel: card.ariaLabel,
      });
      cardEl.appendChild(DS.layouts.categoryHeading(card.title));
      var pillarsLayout =
        card.pillarsLayout && typeof card.pillarsLayout === "object"
          ? card.pillarsLayout
          : card.pillarsVariant === "twoColumn"
            ? { variant: "twoColumn" }
            : undefined;
      var pillars = DS.layouts.pillarsStack(pillarsLayout);
      (card.rows || []).forEach(function (r, idx) {
        var row = DS.layouts.pillarRow({
          iconIndex: idx,
          title: r.title,
          subtitle: r.subtitle,
          valueText: r.valueText,
          scoreLike: !!r.scoreLike,
          riskLevel: r.riskLevel || null,
        });
        if (r.scoreLike && r.numericScore != null && isFinite(Number(r.numericScore))) {
          var domainLike = { value: DS.score.clampPct(Number(r.numericScore)) };
          var pr = DS.score.resolvePassedTotal(domainLike);
          DS.widgets.syncRowProgressUi(row, pr.passed, pr.total, {
            t: t,
            numberLocaleTag: numberLocaleTag,
          });
        }
        pillars.appendChild(row);
      });
      cardEl.appendChild(pillars);
      root.appendChild(cardEl);
    }
  });

  DS.motion.expandElementsBySelector(root, ".row-progress-fill", "row-progress-fill--expanded");
  DS.motion.expandElementsBySelector(root, ".pc-stacked-bar__seg-fill", "pc-stacked-bar__seg-fill--expanded");
}

export const ProgenCraft = {
  data: {
    readPayload: readPayload,
  },
  views: {
    metrics: {
      renderDashboardView: renderDashboardView,
    },
  },
};

globalThis.ProgenCraft = ProgenCraft;
