import express from 'express';
import { copyFile, access, mkdir } from 'fs/promises';
import { resolve } from 'path';
import config from './config.js';
import LockManager from './lock-manager.js';
import CsvManager from './csv-manager.js';
import MetricsProcessor from './metrics-processor.js';
import AuditLogger from './audit-logger.js';
import BrowserTool from './browser-tool.js';
import LocalAuditTool from './local-audit-tool.js';
import { validatePayload } from './validator.js';

// --- Bootstrap: copy templates from artifacts → workspace ---
await mkdir(config.workspaceDir, { recursive: true });
for (const [, filename] of Object.entries(config.templates)) {
  const src = resolve(config.artifactsDir, filename);
  const dest = resolve(config.workspaceDir, filename);
  try {
    await access(dest);
  } catch {
    await copyFile(src, dest);
  }
}

const app = express();
app.use(express.json());

// --- Instances ---
const lockManager = new LockManager();
const csvManager = new CsvManager(lockManager);
const metricsProcessor = new MetricsProcessor(lockManager);
const auditLogger = new AuditLogger();
const browserTool = new BrowserTool();
const localAuditTool = new LocalAuditTool();

// --- Auth middleware ---
function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== config.bearerToken) {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  }
  req.clientId = req.headers['x-client-id'] || 'anonymous';
  next();
}
app.use('/api', auth);

// --- Batch guard middleware ---
function rejectBatch(req, res, next) {
  const body = req.body;
  if (Array.isArray(body)) {
    return res.status(400).json({
      ok: false,
      error: 'BATCH_NOT_ALLOWED',
      message: 'Batch operations are not supported. Process one row at a time.',
      usage: 'Send a single object with mode: "next_unchecked" or mode: "by_row_id" with a rowId.',
    });
  }
  if (body && (body.rowIds || body.rows || body.batch)) {
    return res.status(400).json({
      ok: false,
      error: 'BATCH_NOT_ALLOWED',
      message: 'Multi-row operations are not supported. Process one row at a time.',
    });
  }
  next();
}

// --- Health ---
app.get('/health', (_req, res) => res.json({ ok: true, dryRun: config.dryRun }));

// === TEMPLATE ENDPOINTS ===

// Download/info template — copies fresh from artifacts → workspace
app.post('/api/templates/:name/download', async (req, res) => {
  const filename = config.templates[req.params.name];
  if (filename) {
    const src = resolve(config.artifactsDir, filename);
    const dest = resolve(config.workspaceDir, filename);
    await copyFile(src, dest);
  }
  const result = await csvManager.download(req.params.name, req.clientId);
  auditLogger.log({ action: 'download', clientId: req.clientId, template: req.params.name, outcome: result.ok ? 'success' : 'error', details: result });
  res.json(result);
});

// Template status
app.get('/api/templates/:name/status', async (req, res) => {
  const result = await csvManager.getStatus(req.params.name);
  res.json(result);
});

// === CHECKLIST ROW ENDPOINTS ===

// Read one row
app.post('/api/checklist/read', rejectBatch, async (req, res) => {
  const { mode, rowId } = req.body;
  const result = await csvManager.readRow('checklist', { mode, rowId, clientId: req.clientId });
  auditLogger.log({
    action: 'read_row', clientId: req.clientId, template: 'checklist',
    rowId: result.rowId ?? rowId ?? null, lockId: result.lockId ?? null,
    outcome: result.ok ? 'success' : 'error', details: result.ok ? null : result,
  });
  res.json(result);
});

// Write one row
app.post('/api/checklist/write', rejectBatch, async (req, res) => {
  const { rowId, lockId, payload, keepLock } = req.body;

  if (rowId == null || !lockId || !payload) {
    return res.status(400).json({ ok: false, error: 'MISSING_FIELDS', required: ['rowId', 'lockId', 'payload'] });
  }

  const validation = validatePayload(payload);
  if (!validation.valid) {
    auditLogger.log({ action: 'write_row', clientId: req.clientId, template: 'checklist', rowId, lockId, outcome: 'error', details: { error: 'VALIDATION_FAILED', errors: validation.errors } });
    return res.status(400).json({ ok: false, error: 'VALIDATION_FAILED', errors: validation.errors });
  }

  const result = await csvManager.writeRow('checklist', { rowId, lockId, payload: validation.payload, keepLock });
  auditLogger.log({ action: 'write_row', clientId: req.clientId, template: 'checklist', rowId, lockId, outcome: result.ok ? 'success' : 'error', details: result.ok ? null : result });
  res.json(result);
});

// === METRICS ROW ENDPOINTS ===

app.post('/api/metrics/read', rejectBatch, async (req, res) => {
  const { mode, rowId } = req.body;
  const result = await metricsProcessor.readRow({ mode, rowId, clientId: req.clientId });
  auditLogger.log({ action: 'read_row', clientId: req.clientId, template: 'metrics', rowId: result.rowId ?? rowId ?? null, lockId: result.lockId ?? null, outcome: result.ok ? 'success' : 'error', details: result.ok ? null : result });
  res.json(result);
});

app.post('/api/metrics/write', rejectBatch, async (req, res) => {
  const { rowId, lockId, value, keepLock } = req.body;
  if (rowId == null || !lockId || value === undefined) {
    return res.status(400).json({ ok: false, error: 'MISSING_FIELDS', required: ['rowId', 'lockId', 'value'] });
  }
  const result = await metricsProcessor.writeRow({ rowId, lockId, value, keepLock });
  auditLogger.log({ action: 'write_row', clientId: req.clientId, template: 'metrics', rowId, lockId, outcome: result.ok ? 'success' : 'error', details: result.ok ? null : result });
  res.json(result);
});

app.get('/api/metrics/status', async (req, res) => {
  const result = await metricsProcessor.getStatus();
  res.json(result);
});

// === LOCK MANAGEMENT ===

app.post('/api/locks/unlock', async (req, res) => {
  const { template, rowId, lockId } = req.body;
  const result = lockManager.release(template, rowId, lockId);
  auditLogger.log({ action: 'unlock', clientId: req.clientId, template, rowId, lockId, outcome: result.ok ? 'success' : 'error', details: result.ok ? null : result });
  res.json(result);
});

app.post('/api/locks/extend', async (req, res) => {
  const { template, rowId, lockId } = req.body;
  const result = lockManager.extend(template, rowId, lockId);
  auditLogger.log({ action: 'extend_lock', clientId: req.clientId, template, rowId, lockId, outcome: result.ok ? 'success' : 'error', details: result.ok ? null : result });
  res.json(result);
});

// === AUDIT TOOLS ===

// Chrome DevTools audit
app.post('/api/tools/chromedevtools-audit', async (req, res) => {
  const { actions, rowId, lockId, template } = req.body;
  auditLogger.log({ action: 'tool_invoke', clientId: req.clientId, template, rowId, lockId, outcome: 'started', details: { tool: 'chromedevtools-audit', actionCount: actions?.length } });

  const result = await browserTool.execute(actions);
  auditLogger.log({ action: 'tool_invoke', clientId: req.clientId, template, rowId, lockId, outcome: result.ok ? 'success' : 'error', details: { tool: 'chromedevtools-audit', error: result.error } });
  res.json(result);
});

// Local workspace audit
app.post('/api/tools/run-local-audit', async (req, res) => {
  const { command, cwd, timeoutMs, rowId, lockId, template } = req.body;
  auditLogger.log({ action: 'tool_invoke', clientId: req.clientId, template, rowId, lockId, outcome: 'started', details: { tool: 'run-local-audit', command } });

  const result = await localAuditTool.execute({ command, cwd, timeoutMs });
  auditLogger.log({ action: 'tool_invoke', clientId: req.clientId, template, rowId, lockId, outcome: result.ok ? 'success' : 'error', details: { tool: 'run-local-audit', error: result.error } });
  res.json(result);
});

// === AUDIT LOGS ===

app.get('/api/logs', (req, res) => {
  const { limit, offset } = req.query;
  res.json({ ok: true, logs: auditLogger.getAllLogs({ limit: parseInt(limit || '100'), offset: parseInt(offset || '0') }) });
});

app.get('/api/logs/:template/:rowId', (req, res) => {
  const logs = auditLogger.getLogsForRow(req.params.template, parseInt(req.params.rowId));
  res.json({ ok: true, logs });
});

app.get('/api/metrics/observability', (_req, res) => {
  res.json({ ok: true, ...auditLogger.getMetrics() });
});

// === MCP TOOL MANIFEST ===

app.get('/api/manifest', (_req, res) => {
  res.json({
    name: 'ui-audit-mcp',
    version: '1.0.0',
    tools: [
      { name: 'download-template', endpoint: 'POST /api/templates/:name/download', params: { name: 'checklist | metrics' } },
      { name: 'read-checklist-row', endpoint: 'POST /api/checklist/read', params: { mode: 'next_unchecked | by_row_id', rowId: 'number (required for by_row_id)' } },
      { name: 'write-checklist-row', endpoint: 'POST /api/checklist/write', params: { rowId: 'number', lockId: 'string', payload: '{ "Implemented? (Yes / No / NA)": "Yes|No|NA", "Comments": "string", "Evidence": "url|path" }', keepLock: 'boolean (optional)' } },
      { name: 'read-metrics-row', endpoint: 'POST /api/metrics/read', params: { mode: 'next_empty | by_row_id', rowId: 'number (required for by_row_id)' } },
      { name: 'write-metrics-row', endpoint: 'POST /api/metrics/write', params: { rowId: 'number', lockId: 'string', value: 'string' } },
      { name: 'unlock-row', endpoint: 'POST /api/locks/unlock', params: { template: 'string', rowId: 'number', lockId: 'string' } },
      { name: 'extend-lock', endpoint: 'POST /api/locks/extend', params: { template: 'string', rowId: 'number', lockId: 'string' } },
      { name: 'chromedevtools-audit', endpoint: 'POST /api/tools/chromedevtools-audit', params: { actions: 'array of {type, ...params}', rowId: 'number', lockId: 'string', template: 'string' } },
      { name: 'run-local-audit', endpoint: 'POST /api/tools/run-local-audit', params: { command: 'string', cwd: 'string (optional)', timeoutMs: 'number (optional)' } },
      { name: 'get-row-logs', endpoint: 'GET /api/logs/:template/:rowId' },
      { name: 'get-status', endpoint: 'GET /api/templates/:name/status' },
      { name: 'get-metrics-status', endpoint: 'GET /api/metrics/status' },
      { name: 'observability', endpoint: 'GET /api/metrics/observability' },
    ],
    contextHygiene: 'After writing a row, discard its content from your prompt. Fetch rows on-demand via read endpoints. Never accumulate row data.',
  });
});

// --- Start ---
const server = app.listen(config.port, () => {
  console.log(`UI Audit MCP server listening on :${config.port} (dryRun=${config.dryRun})`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  lockManager.destroy();
  await browserTool.close();
  server.close();
});

export { app, server, lockManager, csvManager, metricsProcessor, auditLogger, browserTool };
