/**
 * Progen Craft — Design System (facade)
 * Re-exports layouts, components, utils for host apps and the Progen Craft framework.
 */
import { sectorPath } from './utils/geometry.js';
import { parseCssColorToRgb, tooltipStyleForBackground } from './utils/color.js';
import { prefersReducedMotion, expandElementsBySelector } from './utils/motion.js';
import { scoreTierClass, clampPct, resolvePassedTotal } from './utils/score.js';
import { paintMiniDonutSvg, appendMiniDonutBreakdownCard } from './components/mini-donut.js';
import { appendStackedDistributionBar } from './components/stacked-bar.js';
import { syncRowProgressUi } from './components/row-progress.js';
import { createPdfDownloadControl } from './components/pdf-download.js';
import { appendIssuesTable } from './components/issues-table.js';
import { appendScoresBarChart } from './components/scores-bar-chart.js';
import {
  PILLAR_ROW_SVGS,
  layoutCategoryCard,
  layoutCategoryHeading,
  layoutCompositeShell,
  layoutDonutsRow,
  layoutPillarsStack,
  layoutPillarRow,
} from './layouts/metric-category.js';

export const ProgenCraftDesignSystem = {
  geometry: { sectorPath: sectorPath },
  color: {
    parseCssColorToRgb: parseCssColorToRgb,
    tooltipStyleForBackground: tooltipStyleForBackground,
  },
  motion: {
    prefersReducedMotion: prefersReducedMotion,
    expandElementsBySelector: expandElementsBySelector,
  },
  score: {
    tierClass: scoreTierClass,
    clampPct: clampPct,
    resolvePassedTotal: resolvePassedTotal,
  },
  widgets: {
    syncRowProgressUi: syncRowProgressUi,
    createPdfDownloadControl: createPdfDownloadControl,
    appendIssuesTable: appendIssuesTable,
  },
  charts: {
    paintMiniDonutSvg: paintMiniDonutSvg,
    appendMiniDonutBreakdownCard: appendMiniDonutBreakdownCard,
    appendStackedDistributionBar: appendStackedDistributionBar,
    appendScoresBarChart: appendScoresBarChart,
  },
  layouts: {
    categoryCard: layoutCategoryCard,
    categoryHeading: layoutCategoryHeading,
    compositeShell: layoutCompositeShell,
    donutsRow: layoutDonutsRow,
    pillarsStack: layoutPillarsStack,
    pillarRow: layoutPillarRow,
  },
  tokens: {
    PILLAR_ROW_SVGS: PILLAR_ROW_SVGS,
  },
};
