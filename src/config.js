import { resolve } from 'path';
import { readdirSync } from 'fs';

// Workspace resolution priority:
// 1. CLI argument (node mcp-stdio.js /path/to/workspace)
// 2. MCP_WORKSPACE environment variable
// 3. process.cwd() — set by Cursor via the "cwd" field in mcp.json
const workspaceArg = process.argv[2];
const workspaceDir = resolve(
  workspaceArg || process.env.MCP_WORKSPACE || process.cwd()
);

const artifactsDir = resolve(process.env.MCP_ARTIFACTS || resolve(import.meta.dirname, '../artifacts'));
const artifactFiles = readdirSync(artifactsDir).filter(f => f.endsWith('.csv'));

// Map template names from artifact filenames:
// - A file containing "checklist" (case-insensitive) → checklist
// - A file containing "metrics" (case-insensitive) → metrics
const templates = {};
for (const file of artifactFiles) {
  const lower = file.toLowerCase();
  if (lower.includes('checklist')) templates.checklist = file;
  if (lower.includes('metrics')) templates.metrics = file;
}

const config = {
  port: parseInt(process.env.MCP_PORT || '3100', 10),
  bearerToken: process.env.MCP_BEARER_TOKEN || 'dev-token',
  workspaceDir,
  artifactsDir,
  lockTimeoutMs: parseInt(process.env.MCP_LOCK_TIMEOUT_MS || String(10 * 60 * 1000), 10),
  maxConcurrencyPerClient: parseInt(process.env.MCP_MAX_CONCURRENCY || '1', 10),
  dryRun: process.env.MCP_DRY_RUN === 'true',
  maxCommentLength: 2000,
  templates,
  allowedWriteColumns: ['Implemented? (Yes / No / NA)', 'Comments', 'Evidence'],
};

export default config;
