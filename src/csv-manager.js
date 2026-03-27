import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import config, { getWorkspaceMetricsCsvPath } from './config.js';

class CsvManager {
  constructor(lockManager) {
    this.lockManager = lockManager;
    this._fileLocks = new Map(); // simple async mutex per file path
  }

  _templatePath(templateName) {
    if (templateName === 'metrics') return getWorkspaceMetricsCsvPath();
    const filename = config.templates[templateName];
    if (!filename) return null;
    return resolve(config.workspaceDir, filename);
  }

  async download(templateName) {
    const filePath = this._templatePath(templateName);
    if (!filePath) return { ok: false, error: 'UNKNOWN_TEMPLATE', templates: Object.keys(config.templates) };

    const content = await readFile(filePath, 'utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true });
    const columns = records.length > 0 ? Object.keys(records[0]) : [];

    return {
      ok: true,
      template: templateName,
      path: filePath,
      columns,
      rowCount: records.length,
    };
  }

  async readRow(templateName, { mode, rowId, clientId }) {
    const filePath = this._templatePath(templateName);
    if (!filePath) return { ok: false, error: 'UNKNOWN_TEMPLATE' };

    const content = await readFile(filePath, 'utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true });

    let targetIdx;

    if (mode === 'by_row_id') {
      targetIdx = parseInt(rowId, 10);
      if (isNaN(targetIdx) || targetIdx < 0 || targetIdx >= records.length) {
        return { ok: false, error: 'INVALID_ROW_ID', rowId, total: records.length };
      }
    } else if (mode === 'next_unchecked') {
      targetIdx = -1;
      for (let i = 0; i < records.length; i++) {
        const impl = (records[i]['Implemented? (Yes / No)'] || '').trim();
        if (!impl && !this.lockManager.isLocked(templateName, i)) {
          targetIdx = i;
          break;
        }
      }
      if (targetIdx === -1) {
        return { ok: false, error: 'NO_UNCHECKED_ROWS', total: records.length };
      }
    } else {
      return { ok: false, error: 'INVALID_MODE', validModes: ['next_unchecked', 'by_row_id'] };
    }

    const lockResult = this.lockManager.acquire(templateName, targetIdx, clientId);
    if (!lockResult.ok) return { ok: false, error: lockResult.error, details: lockResult };

    return {
      ok: true,
      template: templateName,
      rowId: targetIdx,
      lockId: lockResult.lockId,
      lockExpiresAt: new Date(lockResult.expiresAt).toISOString(),
      fields: records[targetIdx],
      totalRows: records.length,
    };
  }

  async writeRow(templateName, { rowId, lockId, payload }) {
    const filePath = this._templatePath(templateName);
    if (!filePath) return { ok: false, error: 'UNKNOWN_TEMPLATE' };

    const lockCheck = this.lockManager.validate(templateName, rowId, lockId);
    if (!lockCheck.valid) return { ok: false, error: lockCheck.error };

    await this._acquireFileLock(filePath);
    try {
      const content = await readFile(filePath, 'utf-8');
      const records = parse(content, { columns: true, skip_empty_lines: true });

      if (rowId < 0 || rowId >= records.length) {
        return { ok: false, error: 'INVALID_ROW_ID', rowId };
      }

      for (const col of Object.keys(payload)) {
        if (!config.allowedWriteColumns.includes(col)) {
          return { ok: false, error: 'DISALLOWED_COLUMN', column: col, allowed: config.allowedWriteColumns };
        }
      }

      for (const [col, val] of Object.entries(payload)) {
        records[rowId][col] = val;
      }

      const columns = Object.keys(records[0]);
      const csv = stringify(records, { header: true, columns });
      await writeFile(filePath, csv, 'utf-8');

      this.lockManager.release(templateName, rowId, lockId);

      return { ok: true, rowId };
    } finally {
      this._releaseFileLock(filePath);
    }
  }

  async getStatus(templateName) {
    const filePath = this._templatePath(templateName);
    if (!filePath) return { ok: false, error: 'UNKNOWN_TEMPLATE' };

    const content = await readFile(filePath, 'utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true });

    let done = 0, pending = 0, locked = 0;
    for (let i = 0; i < records.length; i++) {
      const impl = (records[i]['Implemented? (Yes / No)'] || '').trim();
      if (impl) {
        done++;
      } else if (this.lockManager.isLocked(templateName, i)) {
        locked++;
      } else {
        pending++;
      }
    }

    return { ok: true, template: templateName, total: records.length, done, pending, locked };
  }

  async _acquireFileLock(filePath) {
    while (this._fileLocks.get(filePath)) {
      await new Promise(r => setTimeout(r, 50));
    }
    this._fileLocks.set(filePath, true);
  }

  _releaseFileLock(filePath) {
    this._fileLocks.delete(filePath);
  }
}

export default CsvManager;
