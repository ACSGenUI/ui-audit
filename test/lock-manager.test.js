import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import LockManager from '../src/lock-manager.js';

describe('LockManager', () => {
  let lm;

  beforeEach(() => {
    lm = new LockManager();
  });

  afterEach(() => {
    lm.destroy();
  });

  it('should acquire a lock', () => {
    const result = lm.acquire('checklist', 0, 'client-1');
    assert.equal(result.ok, true);
    assert.ok(result.lockId);
    assert.ok(result.expiresAt > Date.now());
  });

  it('should reject lock if already held by another client', () => {
    lm.acquire('checklist', 0, 'client-1');
    const result = lm.acquire('checklist', 0, 'client-2');
    assert.equal(result.ok, false);
    assert.equal(result.error, 'ROW_LOCKED');
  });

  it('should allow same client to reacquire', () => {
    lm.acquire('checklist', 0, 'client-1');
    const result = lm.acquire('checklist', 0, 'client-1');
    assert.equal(result.ok, true);
    assert.equal(result.reacquired, true);
  });

  it('should enforce concurrency limit', () => {
    lm.acquire('checklist', 0, 'client-1');
    const result = lm.acquire('checklist', 1, 'client-1');
    assert.equal(result.ok, false);
    assert.equal(result.error, 'CONCURRENCY_LIMIT');
  });

  it('should validate a valid lock', () => {
    const { lockId } = lm.acquire('checklist', 0, 'client-1');
    const result = lm.validate('checklist', 0, lockId);
    assert.equal(result.valid, true);
  });

  it('should reject validation with wrong lockId', () => {
    lm.acquire('checklist', 0, 'client-1');
    const result = lm.validate('checklist', 0, 'wrong-id');
    assert.equal(result.valid, false);
    assert.equal(result.error, 'LOCK_MISMATCH');
  });

  it('should release a lock', () => {
    const { lockId } = lm.acquire('checklist', 0, 'client-1');
    const result = lm.release('checklist', 0, lockId);
    assert.equal(result.ok, true);
    assert.equal(lm.isLocked('checklist', 0), false);
  });

  it('should extend a lock', () => {
    const { lockId } = lm.acquire('checklist', 0, 'client-1');
    const result = lm.extend('checklist', 0, lockId);
    assert.equal(result.ok, true);
    assert.ok(result.expiresAt > Date.now());
  });

  it('should report isLocked correctly', () => {
    assert.equal(lm.isLocked('checklist', 0), false);
    lm.acquire('checklist', 0, 'client-1');
    assert.equal(lm.isLocked('checklist', 0), true);
  });

  it('should allow acquisition after release frees concurrency', () => {
    const { lockId } = lm.acquire('checklist', 0, 'client-1');
    lm.release('checklist', 0, lockId);
    const result = lm.acquire('checklist', 1, 'client-1');
    assert.equal(result.ok, true);
  });
});
