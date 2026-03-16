import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, copyFile } from 'fs/promises';
import { resolve } from 'path';

// Set dry-run and test token before importing server
process.env.MCP_DRY_RUN = 'true';
process.env.MCP_BEARER_TOKEN = 'test-token';
process.env.MCP_PORT = '0'; // random port

const BASE_URL_PLACEHOLDER = 'http://localhost';
let baseUrl;
let serverModule;

const headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer test-token',
  'X-Client-Id': 'test-client',
};

async function api(method, path, body) {
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${baseUrl}${path}`, opts);
  return res.json();
}

describe('MCP Server Integration', () => {
  before(async () => {
    serverModule = await import('../src/index.js');
    const addr = serverModule.server.address();
    baseUrl = `http://localhost:${addr.port}`;
  });

  after(async () => {
    serverModule.lockManager.destroy();
    serverModule.server.close();
  });

  it('GET /health returns ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.dryRun, true);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await fetch(`${baseUrl}/api/templates/checklist/status`);
    const data = await res.json();
    assert.equal(data.ok, false);
    assert.equal(data.error, 'UNAUTHORIZED');
  });

  it('GET /api/manifest returns tool list', async () => {
    const res = await fetch(`${baseUrl}/api/manifest`, { headers });
    const data = await res.json();
    assert.ok(data.tools.length > 0);
    assert.ok(data.contextHygiene);
  });

  it('POST /api/templates/checklist/download returns template info', async () => {
    const data = await api('POST', '/api/templates/checklist/download');
    assert.equal(data.ok, true);
    assert.ok(data.columns.includes('Checklist Item'));
    assert.ok(data.rowCount > 0);
  });

  it('POST /api/checklist/read with next_unchecked returns one row', async () => {
    // Release any prior locks first
    serverModule.lockManager.destroy();
    // Re-create lock manager internals
    Object.assign(serverModule.lockManager, { locks: new Map(), clientLocks: new Map() });

    const data = await api('POST', '/api/checklist/read', { mode: 'next_unchecked' });
    assert.equal(data.ok, true);
    assert.equal(typeof data.rowId, 'number');
    assert.ok(data.lockId);
    assert.ok(data.fields['Checklist Item']);

    // Cleanup
    await api('POST', '/api/locks/unlock', { template: 'checklist', rowId: data.rowId, lockId: data.lockId });
  });

  it('POST /api/checklist/read with by_row_id returns specific row', async () => {
    const data = await api('POST', '/api/checklist/read', { mode: 'by_row_id', rowId: 5 });
    assert.equal(data.ok, true);
    assert.equal(data.rowId, 5);

    // Cleanup
    await api('POST', '/api/locks/unlock', { template: 'checklist', rowId: data.rowId, lockId: data.lockId });
  });

  it('rejects batch array requests', async () => {
    const res = await fetch(`${baseUrl}/api/checklist/read`, {
      method: 'POST',
      headers,
      body: JSON.stringify([{ mode: 'by_row_id', rowId: 0 }, { mode: 'by_row_id', rowId: 1 }]),
    });
    const data = await res.json();
    assert.equal(data.ok, false);
    assert.equal(data.error, 'BATCH_NOT_ALLOWED');
  });

  it('POST /api/checklist/write validates and persists (dry-run)', async () => {
    const readData = await api('POST', '/api/checklist/read', { mode: 'by_row_id', rowId: 2 });
    assert.equal(readData.ok, true);

    const writeData = await api('POST', '/api/checklist/write', {
      rowId: readData.rowId,
      lockId: readData.lockId,
      payload: {
        'Implemented? (Yes / No / NA)': 'yes',
        'Comments': 'Verified via code audit',
        'Evidence': 'https://example.com/proof.png',
      },
    });
    assert.equal(writeData.ok, true);
    assert.equal(writeData.persisted, false); // dry-run
  });

  it('rejects write with invalid Implemented value', async () => {
    const readData = await api('POST', '/api/checklist/read', { mode: 'by_row_id', rowId: 3 });

    const writeData = await api('POST', '/api/checklist/write', {
      rowId: readData.rowId,
      lockId: readData.lockId,
      payload: {
        'Implemented? (Yes / No / NA)': 'maybe',
        'Comments': 'test',
        'Evidence': 'https://example.com',
      },
    });
    assert.equal(writeData.ok, false);
    assert.equal(writeData.error, 'VALIDATION_FAILED');

    // Cleanup
    await api('POST', '/api/locks/unlock', { template: 'checklist', rowId: readData.rowId, lockId: readData.lockId });
  });

  it('rejects write with disallowed column', async () => {
    const readData = await api('POST', '/api/checklist/read', { mode: 'by_row_id', rowId: 4 });

    const writeData = await api('POST', '/api/checklist/write', {
      rowId: readData.rowId,
      lockId: readData.lockId,
      payload: { 'Phase': 'Hacked' },
    });
    assert.equal(writeData.ok, false);

    await api('POST', '/api/locks/unlock', { template: 'checklist', rowId: readData.rowId, lockId: readData.lockId });
  });

  it('POST /api/locks/extend extends lock expiry', async () => {
    const readData = await api('POST', '/api/checklist/read', { mode: 'by_row_id', rowId: 6 });
    const extResult = await api('POST', '/api/locks/extend', {
      template: 'checklist',
      rowId: readData.rowId,
      lockId: readData.lockId,
    });
    assert.equal(extResult.ok, true);
    assert.ok(extResult.expiresAt > Date.now());

    await api('POST', '/api/locks/unlock', { template: 'checklist', rowId: readData.rowId, lockId: readData.lockId });
  });

  it('GET /api/logs/:template/:rowId returns audit logs', async () => {
    const data = await api('GET', '/api/logs/checklist/2');
    assert.equal(data.ok, true);
    assert.ok(Array.isArray(data.logs));
  });

  it('GET /api/metrics/observability returns metrics', async () => {
    const data = await api('GET', '/api/metrics/observability');
    assert.equal(data.ok, true);
    assert.equal(typeof data.reads, 'number');
  });

  it('GET /api/templates/checklist/status returns progress', async () => {
    const data = await api('GET', '/api/templates/checklist/status');
    assert.equal(data.ok, true);
    assert.ok(data.total > 0);
  });
});
