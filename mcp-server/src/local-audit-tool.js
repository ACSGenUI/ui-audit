import { exec } from 'child_process';
import { resolve } from 'path';
import config from './config.js';

class LocalAuditTool {
  async execute({ command, cwd, timeoutMs = 60000 }) {
    if (!command || typeof command !== 'string') {
      return { ok: false, error: 'INVALID_COMMAND', message: 'command must be a non-empty string' };
    }

    // Sanitize: only allow execution within workspace
    const workDir = cwd ? resolve(config.workspaceDir, cwd) : config.workspaceDir;
    if (!workDir.startsWith(config.workspaceDir)) {
      return { ok: false, error: 'PATH_TRAVERSAL', message: 'cwd must be within workspace' };
    }

    return new Promise((resolvePromise) => {
      const proc = exec(command, {
        cwd: workDir,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, NODE_ENV: 'audit' },
      }, (error, stdout, stderr) => {
        if (error) {
          resolvePromise({
            ok: false,
            error: 'COMMAND_FAILED',
            exitCode: error.code ?? null,
            signal: error.signal ?? null,
            stdout: truncate(stdout, 2000),
            stderr: truncate(stderr, 2000),
          });
        } else {
          resolvePromise({
            ok: true,
            exitCode: 0,
            stdout: truncate(stdout, 4000),
            stderr: truncate(stderr, 1000),
          });
        }
      });
    });
  }
}

function truncate(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  return str.slice(0, max) + `\n...[truncated, ${str.length - max} chars omitted]`;
}

export default LocalAuditTool;
