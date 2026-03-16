# UI Audit MCP Server — API Reference

## Overview

A JavaScript MCP server enforcing **single-row atomic** UI audit operations with row locking, validation, and audit logging. All endpoints return compact JSON.

## Running

```bash
cd mcp-server
npm install
npm start                    # default port 3100
MCP_DRY_RUN=true npm start   # simulate mode (no file writes)
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MCP_PORT` | `3100` | Server port |
| `MCP_BEARER_TOKEN` | `dev-token` | Auth token |
| `MCP_WORKSPACE` | `../` (parent dir) | Workspace root containing CSVs |
| `MCP_ARTIFACTS` | `./artifacts` | Artifact storage dir |
| `MCP_LOCK_TIMEOUT_MS` | `600000` (10 min) | Lock expiry |
| `MCP_MAX_CONCURRENCY` | `1` | Max locks per client per template |
| `MCP_DRY_RUN` | `false` | Skip file writes |

## Authentication

All `/api/*` endpoints require `Authorization: Bearer <token>` header.
Include `X-Client-Id: <id>` to identify the calling agent.

---

## Endpoints

### Health

`GET /health` → `{ ok, dryRun }`

### Tool Manifest

`GET /api/manifest` → Full tool list with parameter descriptions and context hygiene instructions.

---

### Templates

**Download/Info**
`POST /api/templates/:name/download`
- `:name` = `checklist` | `metrics`
- Returns: `{ ok, template, path, columns, rowCount }`

**Status**
`GET /api/templates/:name/status`
- Returns: `{ ok, template, total, done, pending, locked }`

---

### Checklist Rows (single-row only)

**Read one row**
`POST /api/checklist/read`
```json
{ "mode": "next_unchecked" }
// or
{ "mode": "by_row_id", "rowId": 5 }
```
Returns:
```json
{
  "ok": true,
  "rowId": 5,
  "lockId": "uuid",
  "lockExpiresAt": "ISO-8601",
  "fields": { "Phase": "...", "Checklist Item": "...", ... },
  "totalRows": 268
}
```

**Write one row**
`POST /api/checklist/write`
```json
{
  "rowId": 5,
  "lockId": "uuid",
  "payload": {
    "Implemented? (Yes / No / NA)": "Yes",
    "Comments": "Verified via code audit",
    "Evidence": "https://example.com/proof.png"
  },
  "keepLock": false
}
```
- `Implemented?` must be `Yes`, `No`, or `NA` (case-normalized).
- `Evidence` must be an HTTP(S) URL or a workspace-relative path (path traversal rejected).
- `Comments` max 2000 chars.
- Returns: `{ ok, rowId, persisted, unlocked }`

---

### Metrics Rows (single-row only)

**Read** `POST /api/metrics/read`
```json
{ "mode": "next_empty" }
// or
{ "mode": "by_row_id", "rowId": 10 }
```

**Write** `POST /api/metrics/write`
```json
{ "rowId": 10, "lockId": "uuid", "value": "85" }
```

**Status** `GET /api/metrics/status`

---

### Lock Management

**Unlock** `POST /api/locks/unlock`
```json
{ "template": "checklist", "rowId": 5, "lockId": "uuid" }
```

**Extend heartbeat** `POST /api/locks/extend`
```json
{ "template": "checklist", "rowId": 5, "lockId": "uuid" }
```
Returns: `{ ok, expiresAt }`

---

### Audit Tools

**Chrome DevTools audit**
`POST /api/tools/chromedevtools-audit`
```json
{
  "actions": [
    { "type": "navigate", "url": "http://localhost:3000" },
    { "type": "waitForSelector", "selector": "h1" },
    { "type": "getAttribute", "selector": "img", "attribute": "alt" },
    { "type": "screenshot", "name": "homepage.png", "fullPage": true },
    { "type": "querySelectorAll", "selector": "[role='button']" },
    { "type": "getComputedStyle", "selector": ".btn", "property": "color" },
    { "type": "evaluate", "expression": "document.title" }
  ],
  "rowId": 5, "lockId": "uuid", "template": "checklist"
}
```
Action types: `navigate`, `waitForSelector`, `getAttribute`, `getTextContent`, `click`, `screenshot`, `evaluate`, `querySelectorAll`, `getComputedStyle`.
Returns: `{ ok, results: [...], artifacts: ["artifacts/homepage.png"] }`

On failure, returns a failure screenshot and partial results.

**Local workspace audit**
`POST /api/tools/run-local-audit`
```json
{
  "command": "npx eslint src/ --format json",
  "cwd": "app",
  "timeoutMs": 30000,
  "rowId": 5, "lockId": "uuid", "template": "checklist"
}
```
Returns: `{ ok, exitCode, stdout, stderr }`

---

### Audit Logs

**Per-row logs** `GET /api/logs/:template/:rowId`
**All logs** `GET /api/logs?limit=100&offset=0`
**Observability metrics** `GET /api/metrics/observability`
Returns: `{ total, reads, writes, errors, lockCollisions, avgAuditTimeMs }`

---

## Error Codes

| Code | Meaning |
|---|---|
| `UNAUTHORIZED` | Missing/invalid bearer token |
| `BATCH_NOT_ALLOWED` | Attempted multi-row operation |
| `UNKNOWN_TEMPLATE` | Template name not recognized |
| `INVALID_ROW_ID` | Row ID out of range |
| `INVALID_MODE` | Read mode not recognized |
| `NO_UNCHECKED_ROWS` | All checklist rows are processed or locked |
| `NO_EMPTY_ROWS` | All metrics rows are filled or locked |
| `ROW_LOCKED` | Row locked by another client |
| `CONCURRENCY_LIMIT` | Client already holds max locks for this template |
| `NO_LOCK` | No lock exists for this row |
| `LOCK_MISMATCH` | Provided lockId doesn't match |
| `LOCK_EXPIRED` | Lock timed out |
| `DISALLOWED_COLUMN` | Write attempted on a non-writable column |
| `VALIDATION_FAILED` | Payload values didn't pass validation |
| `MISSING_FIELDS` | Required request fields missing |
| `PATH_TRAVERSAL` | Evidence path escapes workspace |
| `BROWSER_ERROR` | Puppeteer action failed |
| `COMMAND_FAILED` | Local audit command returned non-zero |

---

## Context Hygiene

**Instructions for LLM agents calling this MCP:**

1. You will receive exactly **one audit row at a time**. After you finish the audit and successfully write the three allowed columns back, **immediately discard the row content from your working prompt/context**. Do not retain historical row content.
2. **Never request multiple rows** or batch-process. If you need the next item, call `POST /api/checklist/read` with `mode: "next_unchecked"`.
3. Always use `rowId` and `lockId` for stateful operations — never re-send entire file content.
4. Return **short, structured JSON** after each tool call to avoid prompt bloat.
5. If the browser tool fails, capture the failure screenshot as evidence, mark the row `NA`, and unlock for manual follow-up.
6. On lock failure, retry with exponential backoff (max 3 attempts), then report the error.

---

## Testing

```bash
npm test                            # all tests
node --test test/lock-manager.test.js  # unit: lock manager
node --test test/validator.test.js     # unit: validator
node --test test/integration.test.js   # integration: full API
```
