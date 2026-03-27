import { resolve, relative, isAbsolute } from 'path';
import config, { trustedSandboxRoot } from './config.js';

/**
 * True if `targetPath` is the sandbox root or a path inside it (after resolve).
 */
export function isPathInsideSandbox(targetPath) {
  const root = resolve(trustedSandboxRoot);
  const target = resolve(targetPath);
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Reads may use the trusted project tree or packaged templates (outside the repo).
 */
export function isAllowedReadPath(absPath) {
  const target = resolve(absPath);
  if (isPathInsideSandbox(target)) return true;
  const templatesRoot = resolve(config.templatesDir);
  const relT = relative(templatesRoot, target);
  return relT === '' || (!relT.startsWith('..') && !isAbsolute(relT));
}

export function isAllowedWritePath(absPath) {
  return isPathInsideSandbox(absPath);
}

export function assertAllowedReadPath(absPath) {
  if (!isAllowedReadPath(absPath)) {
    return {
      ok: false,
      error: 'PATH_NOT_ALLOWED',
      message: `Path must be under the trusted project root (${trustedSandboxRoot}) or templates directory.`,
    };
  }
  return { ok: true };
}

export function assertAllowedWritePath(absPath) {
  if (!isAllowedWritePath(absPath)) {
    return {
      ok: false,
      error: 'PATH_NOT_ALLOWED',
      message: `Path must be under the trusted project root (${trustedSandboxRoot}). Set UI_AUDIT_PROJECT_ROOT if the host cwd is wrong.`,
    };
  }
  return { ok: true };
}
