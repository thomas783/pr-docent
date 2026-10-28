// An in-memory user store for the demo. Passwords are kept as salted SHA-256 hashes.

import { createHash, randomBytes } from "node:crypto";

const users = new Map();

export function hashPassword(password, salt) {
  return createHash("sha256").update(salt + password).digest("hex");
}

export function addUser(name, password) {
  const salt = randomBytes(8).toString("hex");
  users.set(name, { name, salt, hash: hashPassword(password, salt) });
}

export function findUser(name) {
  return users.get(name) ?? null;
}
