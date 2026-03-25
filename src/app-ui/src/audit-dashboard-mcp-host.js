/**
 * MCP App host context: mirrors the ext-apps host callback pattern
 * (`onhostcontextchanged` → applyDocumentTheme / applyHostStyleVariables). Host theme is the default
 * until the user picks light/dark (see THEME_STORAGE_KEY). Only runs in the bundled MCP dashboard (iframe with a parent bridge).
 *
 * Tool args for `display-audit-dashboard` (`metricsJson`) are applied via `__AUDIT_APPLY_DASHBOARD_PAYLOAD__`
 * so the UI updates when the host sends `ui/notifications/tool-input` (same payload rules as mcp-stdio.js).
 */
import {
  App,
  PostMessageTransport,
  applyDocumentTheme,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";
import { THEME_STORAGE_KEY } from "./audit-dashboard.js";

const DASHBOARD_FALLBACK_PROJECT = "Example Project Audit Report";

function projectNameFromMetrics(metrics, fallback = DASHBOARD_FALLBACK_PROJECT) {
  if (!metrics || typeof metrics !== "object") return fallback;
  const name = metrics["metadata.projectName"];
  if (name == null) return fallback;
  const t = String(name).trim();
  return t !== "" ? t : fallback;
}

/**
 * Mirrors server `resolveDashboardPayloadFromMetricsJson` using bundled DEFAULT_AUDIT_METRICS as fallback.
 * @param {Record<string, unknown> | undefined} toolArgs
 * @returns {object}
 */
function dashboardPayloadFromToolArguments(toolArgs) {
  const M = globalThis.AuditDashboardMetrics;
  const defaultMetrics = M?.DEFAULT_AUDIT_METRICS;
  const defaultPayload = {
    projectName: projectNameFromMetrics(defaultMetrics),
    metrics: defaultMetrics,
  };

  if (!defaultMetrics) return defaultPayload;

  const raw = toolArgs?.metricsJson;
  if (raw === undefined || raw === null) return defaultPayload;

  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return normalizeParsedMetricsPayload(raw, defaultPayload);
  }

  const trimmed = String(raw).trim();
  if (trimmed === "") return defaultPayload;

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return defaultPayload;
  }

  return normalizeParsedMetricsPayload(parsed, defaultPayload);
}

function normalizeParsedMetricsPayload(parsed, defaultPayload) {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return defaultPayload;
  }

  if (parsed.metrics != null && typeof parsed.metrics === "object" && !Array.isArray(parsed.metrics)) {
    const metrics = parsed.metrics;
    const projectName =
      parsed.projectName != null && String(parsed.projectName).trim() !== ""
        ? String(parsed.projectName).trim()
        : projectNameFromMetrics(metrics);
    return { ...parsed, projectName, metrics };
  }

  return {
    projectName: projectNameFromMetrics(parsed),
    metrics: parsed,
  };
}

/** Host theme is the default until the user picks light/dark (stored under THEME_STORAGE_KEY). */
function shouldApplyHostThemeAsDefault() {
  return !localStorage.getItem(THEME_STORAGE_KEY);
}

function notifyThemeSync() {
  if (typeof globalThis.__AUDIT_ON_HOST_THEME_SYNC__ === "function") {
    globalThis.__AUDIT_ON_HOST_THEME_SYNC__();
  }
}

async function connectMcpHostContext() {
  if (typeof window === "undefined" || window.parent === window) return;

  const app = new App({ name: "ui-audit-dashboard", version: "1.0.0" }, {});

  try {
    await app.connect(new PostMessageTransport(window.parent, window.parent));
  } catch {
    return;
  }

  const initialCtx = app.getHostContext();

  globalThis.__AUDIT_AFTER_THEME_RESET__ = function () {
    const ctx = app.getHostContext();
    if (ctx?.theme) applyDocumentTheme(ctx.theme);
  };

  app.onhostcontextchanged = (ctx) => {
    if (ctx.theme && shouldApplyHostThemeAsDefault()) applyDocumentTheme(ctx.theme);
    if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
    notifyThemeSync();
  };

  app.ontoolinput = (params) => {
    const payload = dashboardPayloadFromToolArguments(params.arguments);
    if (typeof globalThis.__AUDIT_APPLY_DASHBOARD_PAYLOAD__ === "function") {
      globalThis.__AUDIT_APPLY_DASHBOARD_PAYLOAD__(payload);
    }
  };

  if (initialCtx) {
    /* First host snapshot after connect: always apply theme so UI matches the host even if a stale
       ui-audit-theme remains in localStorage from a non-MCP run (boot script sets data-theme early). */
    if (initialCtx.theme) applyDocumentTheme(initialCtx.theme);
    if (initialCtx.styles?.variables) applyHostStyleVariables(initialCtx.styles.variables);
    notifyThemeSync();
  }
}

void connectMcpHostContext();
