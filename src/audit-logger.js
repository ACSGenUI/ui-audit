class AuditLogger {
  constructor() {
    this.logs = []; // In-memory; production would use a persistent store
  }

  log({ action, clientId, template, rowId, lockId, outcome, details }) {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      clientId: clientId || null,
      template: template || null,
      rowId: rowId ?? null,
      lockId: lockId || null,
      outcome,
      details: details || null,
    };
    this.logs.push(entry);
    return entry;
  }

  getLogsForRow(template, rowId) {
    return this.logs.filter(e => e.template === template && e.rowId === rowId);
  }

  getAllLogs({ limit = 100, offset = 0 } = {}) {
    return this.logs.slice(offset, offset + limit);
  }

  getMetrics() {
    const total = this.logs.length;
    const reads = this.logs.filter(e => e.action === 'read_row').length;
    const writes = this.logs.filter(e => e.action === 'write_row').length;
    const errors = this.logs.filter(e => e.outcome === 'error').length;
    const lockCollisions = this.logs.filter(e => e.outcome === 'error' && e.details?.error === 'ROW_LOCKED').length;

    const auditTimes = [];
    const readsByRow = new Map();
    const writesByRow = new Map();

    for (const e of this.logs) {
      const key = `${e.template}:${e.rowId}`;
      if (e.action === 'read_row' && e.outcome === 'success') readsByRow.set(key, e.timestamp);
      if (e.action === 'write_row' && e.outcome === 'success') {
        const readTime = readsByRow.get(key);
        if (readTime) {
          auditTimes.push(new Date(e.timestamp) - new Date(readTime));
        }
      }
    }

    const avgAuditTimeMs = auditTimes.length > 0
      ? Math.round(auditTimes.reduce((a, b) => a + b, 0) / auditTimes.length)
      : null;

    return { total, reads, writes, errors, lockCollisions, avgAuditTimeMs };
  }
}

export default AuditLogger;
