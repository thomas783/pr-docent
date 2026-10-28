import { test } from "node:test";
import assert from "node:assert/strict";
import { AttemptLimiter } from "./attempts.js";

test("locks a name after the last allowed failure, then unlocks it", () => {
  let now = 0;
  const limiter = new AttemptLimiter({ maxFailures: 3, lockMs: 1000, now: () => now });
  limiter.recordFailure("ada");
  limiter.recordFailure("ada");
  assert.equal(limiter.lockedFor("ada"), 0);
  limiter.recordFailure("ada");
  assert.equal(limiter.lockedFor("ada"), 1000);
  now = 1000;
  assert.equal(limiter.lockedFor("ada"), 0);
});

test("a success starts the count over", () => {
  const limiter = new AttemptLimiter({ maxFailures: 2 });
  limiter.recordFailure("ada");
  limiter.reset("ada");
  limiter.recordFailure("ada");
  assert.equal(limiter.lockedFor("ada"), 0);
});
