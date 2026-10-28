import { test } from "node:test";
import assert from "node:assert/strict";
import { addUser } from "./users.js";
import { login, sessionFor } from "./login.js";

addUser("ada", "correct horse");

test("opens a session for the right password", () => {
  const result = login("ada", "correct horse");
  assert.equal(result.ok, true);
  assert.equal(sessionFor(result.token).name, "ada");
});

test("answers the same for a wrong password and an unknown name", () => {
  assert.deepEqual(login("ada", "nope"), { ok: false, reason: "invalid credentials" });
  assert.deepEqual(login("nobody", "nope"), { ok: false, reason: "invalid credentials" });
});

test("locks a name after five failures, even for the right password", () => {
  addUser("bob", "right");
  for (let i = 0; i < 5; i++) assert.equal(login("bob", "wrong").reason, "invalid credentials");
  const locked = login("bob", "right");
  assert.equal(locked.reason, "locked");
  assert.ok(locked.retryAfterMs > 0);
});
