import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePullRequestPath, rowSelectors, sha256Hex } from "../src/github.js";

describe("parsePullRequestPath", () => {
  it("recognizes PR pages and the diff tab", () => {
    assert.deepEqual(parsePullRequestPath("/your-org/your-repo/pull/2/changes"), { owner: "your-org", repo: "your-repo", number: 2, onDiff: true });
    assert.deepEqual(parsePullRequestPath("/o/r/pull/7/files"), { owner: "o", repo: "r", number: 7, onDiff: true });
    assert.equal(parsePullRequestPath("/o/r/pull/7").onDiff, false);
  });
  it("ignores other pages", () => {
    for (const path of ["/o/r", "/o/r/pulls", "/o/r/pull/7/commits", "/o/r/issues/7"]) assert.equal(parsePullRequestPath(path), null);
  });
});

describe("sha256Hex", () => {
  it("matches the file ids GitHub uses on the diff page", async () => {
    // Observed on github.com: the diff container of .github/workflows/ci.yml has this id.
    assert.equal(await sha256Hex(".github/workflows/ci.yml"), "b803fcb7f17ed9235f1e5cb1fcd2f5d3b2838429d4368ae4c57ce4436577f03f");
  });
});

describe("rowSelectors", () => {
  it("targets GitHub's line anchors on the requested side", () => {
    assert.deepEqual(rowSelectors("abc", "right", [3, 4]), [
      'tr:has(> td[data-line-anchor="diff-abcR3"])',
      'tr:has(> td[data-line-anchor="diff-abcR4"])',
    ]);
    assert.match(rowSelectors("abc", "left", [7, 7])[0], /diff-abcL7/);
  });
});
