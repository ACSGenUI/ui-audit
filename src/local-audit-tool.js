import { exec } from 'child_process';
import { resolve, isAbsolute } from 'path';
import config from './config.js';

class LocalAuditTool {
  async execute({ command, cwd, timeoutMs = 60000 }) {
    if (!command || typeof command !== 'string') {
      return { ok: false, error: 'INVALID_COMMAND', message: 'command must be a non-empty string' };
    }

    const workDir = cwd
      ? (isAbsolute(cwd) ? cwd : resolve(config.workspaceDir, cwd))
      : config.workspaceDir;

    return new Promise((resolvePromise) => {
      exec(command, {
        cwd: workDir,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
        env: process.env,
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
