import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validatePayload, normalizeImplemented } from '../src/validator.js';

describe('normalizeImplemented', () => {
  it('normalizes yes/no/na case-insensitively', () => {
    assert.equal(normalizeImplemented('yes'), 'Yes');
    assert.equal(normalizeImplemented('YES'), 'Yes');
    assert.equal(normalizeImplemented('no'), 'No');
    assert.equal(normalizeImplemented('NA'), 'NA');
    assert.equal(normalizeImplemented('n/a'), 'NA');
  });

  it('returns null for invalid values', () => {
    assert.equal(normalizeImplemented('maybe'), null);
    assert.equal(normalizeImplemented(''), null);
    assert.equal(normalizeImplemented(null), null);
  });
});

describe('validatePayload', () => {
  it('accepts a valid payload', () => {
    const result = validatePayload({
      'Implemented? (Yes / No / NA)': 'yes',
      'Comments': 'Looks good',
      'Evidence': 'https://example.com/screenshot.png',
    });
    assert.equal(result.valid, true);
    assert.equal(result.payload['Implemented? (Yes / No / NA)'], 'Yes');
  });

  it('rejects disallowed columns', () => {
    const result = validatePayload({ 'Phase': 'Development' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.field === 'Phase'));
  });

  it('rejects invalid Implemented value', () => {
    const result = validatePayload({ 'Implemented? (Yes / No / NA)': 'maybe' });
    assert.equal(result.valid, false);
  });

  it('rejects too-long comments', () => {
    const result = validatePayload({ 'Comments': 'x'.repeat(3000) });
    assert.equal(result.valid, false);
  });

  it('rejects path traversal in Evidence', () => {
    const result = validatePayload({ 'Evidence': '../../../etc/passwd' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.message.includes('traversal')));
  });

  it('accepts workspace-relative paths for Evidence', () => {
    const result = validatePayload({ 'Evidence': 'artifacts/screenshot.png' });
    assert.equal(result.valid, true);
  });

  it('accepts http URLs for Evidence', () => {
    const result = validatePayload({ 'Evidence': 'https://example.com/img.png' });
    assert.equal(result.valid, true);
  });

  it('rejects non-object payloads', () => {
    const result = validatePayload(null);
    assert.equal(result.valid, false);
  });
});
