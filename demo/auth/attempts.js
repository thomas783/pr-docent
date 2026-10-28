// Counts failed logins per name and locks the name for a while after too many in a row, so a
// password can't be guessed by trying one after another.

export const MAX_FAILURES = 5;
export const LOCK_MS = 15 * 60 * 1000;

export class AttemptLimiter {
  constructor({ maxFailures = MAX_FAILURES, lockMs = LOCK_MS, now = Date.now } = {}) {
    this.maxFailures = maxFailures;
    this.lockMs = lockMs;
    this.now = now;
    // name → { count, lockedUntil }
    this.failures = new Map();
  }

  /** Milliseconds until [name] may try again, or 0 when it isn't locked. */
  lockedFor(name) {
    const entry = this.failures.get(name);
    return entry ? Math.max(0, entry.lockedUntil - this.now()) : 0;
  }

  recordFailure(name) {
    const entry = this.failures.get(name) ?? { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= this.maxFailures) {
      entry.lockedUntil = this.now() + this.lockMs;
      entry.count = 0;
    }
    this.failures.set(name, entry);
  }

  reset(name) {
    this.failures.delete(name);
  }
}
