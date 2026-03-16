import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import config from './config.js';

class MetricsProcessor {
  constructor(lockManager) {
    this.lockManager = lockManager;
  }

  _metricsPath() {
    return resolve(config.workspaceDir, config.templates.metrics);
  }

  async readRow({ mode, rowId, clientId }) {
    const filePath = this._metricsPath();
    const content = await readFile(filePath, 'utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true });

    let targetIdx;

    if (mode === 'by_row_id') {
      targetIdx = parseInt(rowId, 10);
      if (isNaN(targetIdx) || targetIdx < 0 || targetIdx >= records.length) {
        return { ok: false, error: 'INVALID_ROW_ID', rowId, total: records.length };
      }
    } else if (mode === 'next_empty') {
      targetIdx = -1;
      for (let i = 0; i < records.length; i++) {
        const val = (records[i]['value'] || '').trim();
        if (!val && !this.lockManager.isLocked('metrics', i)) {
          targetIdx = i;
          break;
        }
      }
      if (targetIdx === -1) {
        return { ok: false, error: 'NO_EMPTY_ROWS', total: records.length };
      }
    } else {
      return { ok: false, error: 'INVALID_MODE', validModes: ['next_empty', 'by_row_id'] };
    }

    const lockResult = this.lockManager.acquire('metrics', targetIdx, clientId);
    if (!lockResult.ok) return { ok: false, error: lockResult.error, details: lockResult };

    return {
      ok: true,
      template: 'metrics',
      rowId: targetIdx,
      lockId: lockResult.lockId,
      lockExpiresAt: new Date(lockResult.expiresAt).toISOString(),
      fields: records[targetIdx],
      totalRows: records.length,
    };
  }

  async writeRow({ rowId, lockId, value, keepLock = false }) {
    const filePath = this._metricsPath();

    const lockCheck = this.lockManager.validate('metrics', rowId, lockId);
    if (!lockCheck.valid) return { ok: false, error: lockCheck.error };

    const content = await readFile(filePath, 'utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true });

    if (rowId < 0 || rowId >= records.length) {
      return { ok: false, error: 'INVALID_ROW_ID', rowId };
    }

    records[rowId]['value'] = String(value);

    if (!config.dryRun) {
      const columns = Object.keys(records[0]);
      const csv = stringify(records, { header: true, columns });
      await writeFile(filePath, csv, 'utf-8');
    }

    if (!keepLock) {
      this.lockManager.release('metrics', rowId, lockId);
    }

    return { ok: true, rowId, persisted: !config.dryRun, unlocked: !keepLock };
  }

  async getStatus() {
    const filePath = this._metricsPath();
    const content = await readFile(filePath, 'utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true });

    let filled = 0, empty = 0, locked = 0;
    for (let i = 0; i < records.length; i++) {
      const val = (records[i]['value'] || '').trim();
      if (val) {
        filled++;
      } else if (this.lockManager.isLocked('metrics', i)) {
        locked++;
      } else {
        empty++;
      }
    }

    return { ok: true, template: 'metrics', total: records.length, filled, empty, locked };
  }
}

export default MetricsProcessor;
