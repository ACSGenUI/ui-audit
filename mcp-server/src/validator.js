import { resolve, relative, isAbsolute } from 'path';
import config from './config.js';

const VALID_IMPLEMENTED = ['Yes', 'No', 'NA'];
const URL_RE = /^https?:\/\/.+/;

function normalizeImplemented(value) {
  if (!value || typeof value !== 'string') return null;
  const v = value.trim();
  // Case-normalize
  const lower = v.toLowerCase();
  if (lower === 'yes') return 'Yes';
  if (lower === 'no') return 'No';
  if (lower === 'na' || lower === 'n/a') return 'NA';
  return null;
}

function validatePayload(payload) {
  const errors = [];

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: [{ field: '_root', message: 'Payload must be an object' }] };
  }

  const allowed = new Set(config.allowedWriteColumns);
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) {
      errors.push({ field: key, message: `Column not allowed. Allowed: ${config.allowedWriteColumns.join(', ')}` });
    }
  }

  // Validate Implemented?
  const implKey = 'Implemented? (Yes / No / NA)';
  if (implKey in payload) {
    const normalized = normalizeImplemented(payload[implKey]);
    if (!normalized) {
      errors.push({ field: implKey, message: `Must be one of: ${VALID_IMPLEMENTED.join(', ')}`, received: payload[implKey] });
    } else {
      payload[implKey] = normalized;
    }
  }

  // Validate Comments
  if ('Comments' in payload) {
    const c = payload['Comments'];
    if (typeof c !== 'string') {
      errors.push({ field: 'Comments', message: 'Must be a string' });
    } else if (c.length > config.maxCommentLength) {
      errors.push({ field: 'Comments', message: `Exceeds max length of ${config.maxCommentLength}`, length: c.length });
    }
  }

  // Validate Evidence
  if ('Evidence' in payload) {
    const e = payload['Evidence'];
    if (typeof e !== 'string') {
      errors.push({ field: 'Evidence', message: 'Must be a string' });
    } else if (e.trim() !== '') {
      if (URL_RE.test(e)) {
        // valid URL
      } else {
        // Must be a safe workspace-relative path
        const resolved = isAbsolute(e) ? resolve(e) : resolve(config.workspaceDir, e);
        const rel = relative(config.workspaceDir, resolved);
        if (rel.startsWith('..') || isAbsolute(rel)) {
          errors.push({ field: 'Evidence', message: 'Path traversal detected. Must be within workspace.', received: e });
        } else {
          payload['Evidence'] = rel;
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, payload };
}

export { validatePayload, normalizeImplemented };
