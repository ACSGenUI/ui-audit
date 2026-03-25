import { randomUUID } from 'crypto';
import config from './config.js';

const MAX_CONCURRENCY = 1; // one row at a time per client

class LockManager {
  constructor() {
    this.locks = new Map();       // key: `${template}:${rowId}` → lock object
    this.clientLocks = new Map(); // key: `${template}:${clientId}` → Set<lockKey>
    this._sweepInterval = setInterval(() => this._sweep(), 30_000);
  }

  _key(template, rowId) {
    return `${template}:${rowId}`;
  }

  _clientKey(template, clientId) {
    return `${template}:${clientId}`;
  }

  acquire(template, rowId, clientId) {
    const key = this._key(template, rowId);

    const existing = this.locks.get(key);
    if (existing && existing.expiresAt > Date.now()) {
      if (existing.clientId === clientId) {
        return { ok: true, lockId: existing.lockId, expiresAt: existing.expiresAt };
      }
      return { ok: false, error: 'ROW_LOCKED', holder: existing.clientId, expiresAt: existing.expiresAt };
    }

    const ck = this._clientKey(template, clientId);
    const clientSet = this.clientLocks.get(ck) || new Set();
    for (const lk of clientSet) {
      const l = this.locks.get(lk);
      if (!l || l.expiresAt <= Date.now()) clientSet.delete(lk);
    }
    if (clientSet.size >= MAX_CONCURRENCY) {
      return { ok: false, error: 'CONCURRENCY_LIMIT', current: clientSet.size, max: MAX_CONCURRENCY };
    }

    const lock = {
      lockId: randomUUID(),
      template,
      rowId,
      clientId,
      expiresAt: Date.now() + config.lockTimeoutMs,
    };
    this.locks.set(key, lock);
    clientSet.add(key);
    this.clientLocks.set(ck, clientSet);

    return { ok: true, lockId: lock.lockId, expiresAt: lock.expiresAt };
  }

  validate(template, rowId, lockId) {
    const key = this._key(template, rowId);
    const lock = this.locks.get(key);
    if (!lock) return { valid: false, error: 'NO_LOCK' };
    if (lock.lockId !== lockId) return { valid: false, error: 'LOCK_MISMATCH' };
    if (lock.expiresAt <= Date.now()) {
      this._release(key, lock);
      return { valid: false, error: 'LOCK_EXPIRED' };
    }
    return { valid: true, lock };
  }

  release(template, rowId, lockId) {
    const v = this.validate(template, rowId, lockId);
    if (!v.valid) return { ok: false, error: v.error };
    this._release(this._key(template, rowId), v.lock);
    return { ok: true };
  }

  _release(key, lock) {
    this.locks.delete(key);
    const ck = this._clientKey(lock.template, lock.clientId);
    const set = this.clientLocks.get(ck);
    if (set) {
      set.delete(key);
      if (set.size === 0) this.clientLocks.delete(ck);
    }
  }

  isLocked(template, rowId) {
    const key = this._key(template, rowId);
    const lock = this.locks.get(key);
    if (!lock) return false;
    if (lock.expiresAt <= Date.now()) {
      this._release(key, lock);
      return false;
    }
    return true;
  }

  _sweep() {
    const now = Date.now();
    for (const [key, lock] of this.locks) {
      if (lock.expiresAt <= now) this._release(key, lock);
    }
  }
}

export default LockManager;
