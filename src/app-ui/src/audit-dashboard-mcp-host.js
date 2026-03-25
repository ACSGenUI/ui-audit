/**
 * MCP App host context: mirrors the ext-apps host callback pattern
 * (`onhostcontextchanged` → applyDocumentTheme / applyHostStyleVariables). Host theme is the default
 * until the user chooses light/dark (see THEME_STORAGE_KEY). Only runs in the MCP dashboard iframe.
 */
import {
  App,
  PostMessageTransport,
  applyDocumentTheme,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";
import { THEME_STORAGE_KEY } from "./audit-dashboard.js";

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

  if (initialCtx) {
    /* First host snapshot after connect: always apply theme so UI matches the host even if a stale
       ui-audit-theme remains in localStorage from a non-MCP run (boot script sets data-theme early). */
    if (initialCtx.theme) applyDocumentTheme(initialCtx.theme);
    if (initialCtx.styles?.variables) applyHostStyleVariables(initialCtx.styles.variables);
    notifyThemeSync();
  }
}

void connectMcpHostContext();
