import { resolve } from 'path';

/**
 * Project root when the MCP server must not rely on `process.cwd()` (often wrong when the host spawns
 * the process from home or a global directory). Set in MCP server `env`, e.g. `UI_AUDIT_PROJECT_ROOT`.
 */
export function getProjectRootForWorkspace() {
  for (const key of ['UI_AUDIT_PROJECT_ROOT', 'MCP_UI_AUDIT_PROJECT_ROOT']) {
    const v = process.env[key];
    if (v != null && String(v).trim() !== '') {
      return resolve(String(v).trim());
    }
  }
  return process.cwd();
}

const projectDir = getProjectRootForWorkspace();

const config = {
  workspaceDir: resolve(projectDir, '.ui-audit'),
  templatesDir: resolve(process.env.MCP_TEMPLATES || resolve(import.meta.dirname, '../templates')),
  lockTimeoutMs: parseInt(process.env.MCP_LOCK_TIMEOUT_MS || String(10 * 60 * 1000), 10),
  maxCommentLength: 2000,
  templates: {
    'code-audit': 'Code_Audit_Checklist.csv',
    'browser-audit': 'Browser_Audit_Checklist.csv',
    'manual-audit': 'Manual_Checklist.csv',
    'metrics': 'Metrics.csv',
  },
  allowedWriteColumns: ['Implemented? (Yes / No)', 'Comments', 'Evidence'],
  metricsValueColumn: 'value',
};

/**
 * Absolute path to Metrics.csv: optional per-call overrides, else `config.workspaceDir` + metrics template.
 *
 * @param {{ workspacePath?: string, projectPath?: string } | undefined} overrides
 *   - `workspacePath`: directory that **contains** Metrics.csv (the `.ui-audit` folder).
 *   - `projectPath`: repo root; uses `<projectPath>/.ui-audit/Metrics.csv`.
 */
export function resolveWorkspaceMetricsCsvPath(overrides) {
  if (overrides) {
    const w = overrides.workspacePath != null ? String(overrides.workspacePath).trim() : '';
    const p = overrides.projectPath != null ? String(overrides.projectPath).trim() : '';
    if (w) return resolve(w, config.templates['metrics']);
    if (p) return resolve(resolve(p, '.ui-audit'), config.templates['metrics']);
  }
  return resolve(config.workspaceDir, config.templates['metrics']);
}

/**
 * Default Metrics.csv path for the active `config.workspaceDir` (same as `resolveWorkspaceMetricsCsvPath()` with no overrides).
 */
export function getWorkspaceMetricsCsvPath() {
  return resolveWorkspaceMetricsCsvPath();
}

export default config;
