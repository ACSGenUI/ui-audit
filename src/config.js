import { resolve } from 'path';

// All audit output goes into .ui-audit/ inside the current working directory
// (the project the user has open when they run the audit).
const projectDir = process.cwd();

const config = {
  workspaceDir: resolve(projectDir, '.ui-audit'),
  templatesDir: resolve(process.env.MCP_TEMPLATES || resolve(import.meta.dirname, '../templates')),
  lockTimeoutMs: parseInt(process.env.MCP_LOCK_TIMEOUT_MS || String(10 * 60 * 1000), 10),
  maxCommentLength: 2000,
  templates: {
    'code-audit': 'EDS_Code_Audit_Checklist.csv',
    'browser-audit': 'EDS_Browser_Audit_Checklist.csv',
  },
  allowedWriteColumns: ['Implemented? (Yes / No)', 'Comments', 'Evidence'],
};

export default config;
