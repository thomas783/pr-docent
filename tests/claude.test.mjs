import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { failureCode } from "../host/claude.mjs";

describe("failureCode", () => {
  it("tells a signed-out Claude Code from other failures", () => {
    // What Claude Code 2.1 prints for `claude -p` when it isn't signed in.
    assert.equal(failureCode("Not logged in · Please run /login"), "claudeLoggedOut");
    assert.equal(failureCode("Invalid API key · Fix external API key"), "claudeLoggedOut");
    assert.equal(failureCode("Error: tour.json failed the checker"), undefined);
  });
});
