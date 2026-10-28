// Logging in: checks a name and password and opens a session. After too many failures in a row
// the name is locked for a while, even for the right password.

import { randomUUID } from "node:crypto";
import { AttemptLimiter } from "./attempts.js";
import { findUser, hashPassword } from "./users.js";

const sessions = new Map();
const limiter = new AttemptLimiter();

export function login(name, password) {
  const wait = limiter.lockedFor(name);
  if (wait > 0) return { ok: false, reason: "locked", retryAfterMs: wait };
  const user = findUser(name);
  // One answer for an unknown name and a wrong password, so failures don't tell who has an account.
  if (!user || hashPassword(password, user.salt) !== user.hash) {
    limiter.recordFailure(name);
    return { ok: false, reason: "invalid credentials" };
  }
  limiter.reset(name);
  const token = randomUUID();
  sessions.set(token, { name, createdAt: Date.now() });
  return { ok: true, token };
}

export function sessionFor(token) {
  return sessions.get(token) ?? null;
}
