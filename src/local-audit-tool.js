import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { resolve, isAbsolute, basename } from 'path';
import config from './config.js';
import { isPathInsideSandbox } from './path-guard.js';

/** First token must be one of these (after basename / lowercase). */
const ALLOWED_BINARIES = new Set([
  'grep',
  'egrep',
  'fgrep',
  'rg',
  'ripgrep',
  'cat',
  'head',
  'tail',
  'wc',
  'sort',
  'uniq',
  'cut',
  'ls',
  'pwd',
  'eslint',
  'stylelint',
  'prettier',
  'git',
  'node',
  'find',
  'stat',
  'file',
  'which',
  'readlink',
  'basename',
  'dirname',
  'test',
  'echo',
  'printf',
  'diff',
  'cmp',
  'true',
  'false',
]);

function parseCommandLine(cmd) {
  const args = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote) {
      if (c === quote) quote = null;
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (/\s/.test(c)) {
      if (cur.length) {
        args.push(cur);
        cur = '';
      }
      continue;
    }
    cur += c;
  }
  if (cur.length) args.push(cur);
  return args;
}

function hasUnquotedShellChain(cmd) {
  let quote = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === '|' || c === ';') return true;
    if (cmd.slice(i, i + 2) === '&&' || cmd.slice(i, i + 2) === '||') return true;
    if (c === '`') return true;
    if (c === '$' && (cmd[i + 1] === '(' || cmd[i + 1] === '{')) return true;
  }
  return false;
}

function normalizedCommandName(firstArg) {
  if (!firstArg) return '';
  let base = basename(firstArg);
  if (process.platform === 'win32' && /\.(cmd|exe|bat)$/i.test(base)) {
    base = base.replace(/\.(cmd|exe|bat)$/i, '');
  }
  return base.toLowerCase();
}

function validateNodeArgs(argv) {
  const dangerous = new Set(['-e', '--eval', '-p', '--print']);
  for (let i = 1; i < argv.length; i++) {
    if (dangerous.has(argv[i])) {
      return { ok: false, error: 'NODE_EVAL_FORBIDDEN', message: 'node -e/--eval/-p/--print is not allowed' };
    }
  }
  return { ok: true };
}

function validateFindArgs(argv) {
  const blocked = new Set(['-exec', '-ok', '-execdir', '-okdir']);
  for (const a of argv) {
    if (blocked.has(a)) {
      return { ok: false, error: 'FIND_EXEC_FORBIDDEN', message: 'find -exec/-ok is not allowed' };
    }
  }
  return { ok: true };
}

function validateArgv(argv) {
  if (argv.length === 0) {
    return { ok: false, error: 'EMPTY_COMMAND', message: 'command is empty' };
  }
  const name = normalizedCommandName(argv[0]);
  if (!ALLOWED_BINARIES.has(name)) {
    return {
      ok: false,
      error: 'COMMAND_NOT_ALLOWED',
      message: `Command must start with an allowlisted binary (got "${name}"). Pipes and shell operators are not supported; use a single command.`,
    };
  }
  if (name === 'node') {
    const n = validateNodeArgs(argv);
    if (!n.ok) return n;
  }
  if (name === 'find') {
    const f = validateFindArgs(argv);
    if (!f.ok) return f;
  }
  return { ok: true };
}

class LocalAuditTool {
  async execute({ command, cwd, timeoutMs = 60000 }) {
    if (!command || typeof command !== 'string') {
      return { ok: false, error: 'INVALID_COMMAND', message: 'command must be a non-empty string' };
    }

    const trimmed = command.trim();
    if (trimmed === '') {
      return { ok: false, error: 'INVALID_COMMAND', message: 'command must be a non-empty string' };
    }
    if (/[\r\n]/.test(command)) {
      return { ok: false, error: 'NEWLINE_FORBIDDEN', message: 'multiline commands are not allowed' };
    }
    if (hasUnquotedShellChain(command)) {
      return {
        ok: false,
        error: 'SHELL_CHAIN_FORBIDDEN',
        message: 'pipes (|), ;, &&, ||, subshells, and command substitution are not allowed',
      };
    }

    const argv = parseCommandLine(trimmed);
    const v = validateArgv(argv);
    if (!v.ok) {
      return { ok: false, error: v.error, message: v.message };
    }

    let workDir = cwd
      ? isAbsolute(cwd)
        ? cwd
        : resolve(config.workspaceDir, cwd)
      : existsSync(config.workspaceDir)
        ? config.workspaceDir
        : resolve(config.workspaceDir, '..');

    if (!existsSync(workDir)) {
      return {
        ok: false,
        error: 'CWD_MISSING',
        message: 'working directory does not exist; run set-audit-workspace first or pass an existing cwd',
      };
    }

    if (!isPathInsideSandbox(workDir)) {
      return {
        ok: false,
        error: 'CWD_NOT_ALLOWED',
        message: `cwd must be under the trusted project root`,
      };
    }

    const bin = argv[0];
    return new Promise((resolvePromise) => {
      const child = spawn(bin, argv.slice(1), {
        cwd: workDir,
        env: process.env,
        shell: false,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      const maxOut = 1024 * 1024;
      let timedOut = false;
      let settled = false;

      const finish = (payload) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolvePromise(payload);
      };

      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
        if (stdout.length > maxOut) stdout = stdout.slice(0, maxOut);
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
        if (stderr.length > maxOut) stderr = stderr.slice(0, maxOut);
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, timeoutMs);

      child.on('error', (err) => {
        finish({
          ok: false,
          error: 'SPAWN_FAILED',
          message: err.message,
          stdout: truncate(stdout, 2000),
          stderr: truncate(stderr, 2000),
        });
      });

      child.on('close', (code, signal) => {
        if (settled) return;
        if (timedOut) {
          finish({
            ok: false,
            error: 'TIMEOUT',
            stdout: truncate(stdout, 2000),
            stderr: truncate(stderr, 2000),
          });
          return;
        }
        if (code !== 0) {
          finish({
            ok: false,
            error: 'COMMAND_FAILED',
            exitCode: code,
            signal: signal ?? null,
            stdout: truncate(stdout, 2000),
            stderr: truncate(stderr, 2000),
          });
        } else {
          finish({
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
