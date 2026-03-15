# MCP server configuration

Use one of the configs below for **Cursor**, **Claude Desktop**, or other MCP hosts. Replace `<WORKSPACE_PATH>` with the absolute path to this repo (e.g. `/Users/you/Projects/ui-competency/ui-audit`).

---

## Cursor

Put this in **`.cursor/mcp.json`** in the project root (or in Cursor’s global MCP config).

**With absolute path (recommended):**

```json
{
  "mcpServers": {
    "ui-audit": {
      "command": "node",
      "args": ["mcp-server/src/mcp-stdio.js"],
      "cwd": "/Users/kalimuthua/Projects/ui-competency/ui-audit",
      "env": {
        "MCP_WORKSPACE": "/Users/kalimuthua/Projects/ui-competency/ui-audit",
        "MCP_DRY_RUN": "false"
      }
    }
  }
}
```

**Portable (same repo on another machine):** replace the two paths with your project root, e.g. `"/path/to/ui-audit"`.

**Dry run (no writes):** set `"MCP_DRY_RUN": "true"` in `env`.

---

## Claude Desktop

In **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
In **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Add the `mcpServers` block (or merge into existing `mcpServers`):

```json
{
  "mcpServers": {
    "ui-audit": {
      "command": "node",
      "args": ["/path/to/ui-audit/mcp-server/src/mcp-stdio.js"],
      "env": {
        "MCP_WORKSPACE": "/path/to/ui-audit",
        "MCP_DRY_RUN": "false"
      }
    }
  }
}
```

Use the full path to `mcp-stdio.js` and the same path (project root) for `MCP_WORKSPACE`. Restart Claude Desktop after editing.

---

## Other hosts (generic)

Any host that supports MCP over stdio can use:

- **Command:** `node`
- **Args:** `[ "<WORKSPACE_PATH>/mcp-server/src/mcp-stdio.js" ]`
- **Env:**  
  - `MCP_WORKSPACE` = `<WORKSPACE_PATH>`  
  - `MCP_DRY_RUN` = `false` (or `true` for read-only)

Ensure `node` is on `PATH` and dependencies are installed (`npm install` in `mcp-server/`).

---

## Optional env vars

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_WORKSPACE` | project root | Root of the ui-audit repo |
| `MCP_DRY_RUN` | `false` | `true` = no writes to CSV/files |
| `MCP_ARTIFACTS` | `mcp-server/artifacts` | Override artifacts directory |
| `MCP_PORT` | `3100` | For SSE/HTTP transport only |
| `MCP_LOCK_TIMEOUT_MS` | `600000` | Lock timeout (ms) |
| `MCP_MAX_CONCURRENCY` | `1` | Max concurrency per client |
