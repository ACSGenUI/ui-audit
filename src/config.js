import { resolve } from 'path';

const config = {
  port: parseInt(process.env.MCP_PORT || '3100', 10),
  bearerToken: process.env.MCP_BEARER_TOKEN || 'dev-token',
  workspaceDir: resolve(process.env.MCP_WORKSPACE || resolve(import.meta.dirname, '../../')),
  artifactsDir: resolve(process.env.MCP_ARTIFACTS || resolve(import.meta.dirname, '../artifacts')),
  lockTimeoutMs: parseInt(process.env.MCP_LOCK_TIMEOUT_MS || String(10 * 60 * 1000), 10),
  maxConcurrencyPerClient: parseInt(process.env.MCP_MAX_CONCURRENCY || '1', 10),
  dryRun: process.env.MCP_DRY_RUN === 'true',
  maxCommentLength: 2000,
  templates: {
    checklist: 'EDS_Audit_Checklist.csv',
    metrics: 'metrics.csv',
  },
  allowedWriteColumns: ['Implemented? (Yes / No / NA)', 'Comments', 'Evidence'],
};

export default config;
