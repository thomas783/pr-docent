// Logging in: checks a name and password and opens a session.

import { randomUUID } from "node:crypto";
import { findUser, hashPassword } from "./users.js";

const sessions = new Map();

export function login(name, password) {
  const user = findUser(name);
  if (!user) return { ok: false, reason: "unknown user" };
  if (hashPassword(password, user.salt) !== user.hash) return { ok: false, reason: "wrong password" };
  const token = randomUUID();
  sessions.set(token, { name, createdAt: Date.now() });
  return { ok: true, token };
}

export function sessionFor(token) {
  return sessions.get(token) ?? null;
}
