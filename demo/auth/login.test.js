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

test("rejects a wrong password", () => {
  assert.equal(login("ada", "nope").ok, false);
});
