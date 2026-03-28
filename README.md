# UI Audit MCP Server

MCP (Model Context Protocol) server for **Code Audit**, **Browser Audit**, and **Manual Checklist** workflows. It stores checklist CSVs under `<project>/.ui-audit/`, can **compute metrics** from completed audits, and exposes an **interactive Audit Dashboard** (MCP App).

## Prerequisites

- **Node.js** (current LTS recommended)
- Install dependencies and build the dashboard bundle (required for `display-audit-dashboard`):

```bash
npm install
npm run build
```

The Vite build writes `dist/mcp-dashboard/audit-dashboard-mcp.html`, which the server loads at runtime.

## Cursor: MCP configuration

Add servers in **Cursor Settings → MCP** (or your user/project MCP JSON, e.g. `~/.cursor/mcp.json` or `.cursor/mcp.json`, depending on your Cursor version).

### Local install (clone of this repo)

Use this when you have the repository on disk and have run **`npm install`** and **`npm run build`** in that clone (the server reads `dist/mcp-dashboard/audit-dashboard-mcp.html` at runtime).

Replace the paths with your machine’s paths.

```json
{
  "mcpServers": {
    "ui-audit": {
      "command": "node",
      "args": ["/absolute/path/to/ui-audit/src/mcp-stdio.js"],
      "env": {
        "UI_AUDIT_PROJECT_ROOT": "/absolute/path/to/your-audited-repo"
      }
    }
  }
}
```

### Remote install (`npx` + GitHub)

Runs the server from a **Git branch/tag** without a local clone of `ui-audit`. `npx` downloads the repo on first use (needs network). Ensure the referenced branch includes a built **`dist/mcp-dashboard/`** (or add a `prepare` script upstream); otherwise `display-audit-dashboard` may error until `npm run build` has been run in that package.

```json
{
  "mcpServers": {
    "mcp-audit-remote": {
      "command": "npx",
      "args": [
        "-y",
        "https://github.com/ACSGenUI/ui-audit"
      ],
      "env": {
        "UI_AUDIT_PROJECT_ROOT": "/absolute/path/to/your-audited-repo"
      },
      "transport": "stdio"
    }
  }
}
```

`transport` is included for clients that expect an explicit stdio transport; if your Cursor build ignores unknown keys, it is harmless.

### Why `UI_AUDIT_PROJECT_ROOT`?

The MCP process is often started with a **working directory that is not your open project** (for example your home directory). Audit data lives in **`<repo>/.ui-audit/`**. Setting `UI_AUDIT_PROJECT_ROOT` to the **repository you are auditing** makes `.ui-audit/`, `Metrics.csv`, and templates resolve correctly without relying on `process.cwd()`.

- **`UI_AUDIT_PROJECT_ROOT`** (preferred) or **`MCP_UI_AUDIT_PROJECT_ROOT`**: absolute path to the **project root** (parent of `.ui-audit`).
- If your editor expands variables in MCP `env`, you can try pointing this at the opened folder (behavior depends on Cursor version).

### Optional environment variables

These are **read by the server** in `src/config.js` and related code:

| Variable | Used? | Purpose |
|----------|--------|---------|
| `MCP_TEMPLATES` | **Yes** | Absolute path to a folder of CSV templates. If unset, the server uses this package’s `templates/` directory (`config.templatesDir`). |
| `MCP_LOCK_TIMEOUT_MS` | **Yes** | How long a checklist row lock lasts, in milliseconds. Default: `600000` (10 minutes). Passed through `config.lockTimeoutMs` and applied in `src/lock-manager.js` when acquiring locks. |

`MCP_DRY_RUN` is **not referenced** anywhere under `src/`. You do not need it; older examples included it by mistake.

### After editing MCP config

Restart the MCP server or reload Cursor so the new configuration is picked up.

---

## Prompts (orchestration “commands”)

Prompts are registered with the server. In clients that support **MCP prompts**, you can invoke them by name; they inject a detailed **user-role message** that tells the agent which tools to call and in what order.

| Prompt name | Summary |
|-------------|---------|
| **`start-code-audit`** | Run a full **Code Audit** in one pass: `set-audit-workspace` → `download-template` → loop `read-checklist-row` / `run-local-audit` / `write-checklist-row` until no pending rows → `cleanup-workspace`. Uses local shell inspection (grep, files, linters)—**no browser**. |
| **`start-browser-audit`** | Run a full **Browser Audit**: asks for the **App URL**, then same checklist loop pattern using **Chrome DevTools MCP** (or equivalent) for page inspection—not `run-local-audit` for browser rows. |
| **`generate-report`** | **Recommended** full metrics flow: asks for project metadata and optional CSV paths, then `compute-metrics` (all three checklists server-side) → `write-metrics` → `display-audit-dashboard` → `cleanup-workspace`. |
| **`show-audit-dashboard`** | Tells the agent to call **`display-audit-dashboard`** and to open the MCP App resource; optional `metricsJson` or rely on **`Metrics.csv`** when present (see tool description). |

---

## Tools (reference)

| Tool | Role |
|------|------|
| **`set-audit-workspace`** | Set `templateName` (`code-audit`, `browser-audit`, `manual-audit`, `metrics`) and optional `projectPath`; creates `<project>/.ui-audit/` and points the server workspace at it. |
| **`download-template`** | Copy a fresh template CSV into the workspace (overwrites). |
| **`read-checklist-row`** / **`write-checklist-row`** | Locked read/write for one row (`code-audit` or `browser-audit`). |
| **`get-checklist-status`** / **`unlock-row`** | Progress and lock management. |
| **`read-full-checklist`** | Load an entire checklist as JSON (for legacy metrics flows). |
| **`run-local-audit`** | Run a read-only shell command (code audit evidence). |
| **`compute-metrics`** | Deterministic metrics from code + browser + manual CSVs; returns a flat `metrics` object. |
| **`write-metrics`** | Write flat metrics into **`Metrics.csv`** (same path rules as dashboard; optional `projectPath` / `workspacePath`). |
| **`display-audit-dashboard`** | Open the **Audit Dashboard** MCP App; prefers **`Metrics.csv`**, then `metricsJson`, then built-in sample data. |
| **`cleanup-workspace`** | Delete stray `.json` / `.md` / `.py` under `.ui-audit/`, keep CSVs. |

### Dashboard and `Metrics.csv` path

Resolution for **`Metrics.csv`** is consistent between **`write-metrics`** and **`display-audit-dashboard`**:

1. Optional per-call **`workspacePath`** (folder that contains `Metrics.csv`) or **`projectPath`** (repo root → `.ui-audit/Metrics.csv`).
2. Else **`config.workspaceDir`** after **`set-audit-workspace`**, or initial workspace from **`UI_AUDIT_PROJECT_ROOT`** / **`MCP_UI_AUDIT_PROJECT_ROOT`**, else **`process.cwd()/.ui-audit`**.

---

## Resources

- **Templates**: `audit://templates/code-audit`, `browser-audit`, `metrics` — CSV templates.
- **Audit Dashboard**: `ui://ui-audit/audit-dashboard.html` (MCP App HTML; optional `?data=` for embedded JSON).

---

## Related MCP servers

- **Browser audit**: a **Chrome DevTools** (or browser automation) MCP is expected for **`start-browser-audit`** so the agent can inspect the live URL.

---

## Scripts

| Script | Command |
|--------|---------|
| Start server (stdio) | `npm start` or `node src/mcp-stdio.js` |
| Build dashboard | `npm run build` |

Published package entry: `ui-audit-mcp-server` → `src/mcp-stdio.js`.
