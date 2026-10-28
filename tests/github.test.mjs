import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { frameCss, parsePullRequestPath, rowSelectors, sha256Hex } from "../src/github.js";

describe("parsePullRequestPath", () => {
  it("recognizes PR pages and the diff tab", () => {
    assert.deepEqual(parsePullRequestPath("/your-org/your-repo/pull/2/changes"), { owner: "your-org", repo: "your-repo", number: 2, onDiff: true, onCommits: false });
    assert.deepEqual(parsePullRequestPath("/o/r/pull/7/files"), { owner: "o", repo: "r", number: 7, onDiff: true, onCommits: false });
    assert.equal(parsePullRequestPath("/o/r/pull/7").onDiff, false);
  });
  it("tells a commit or a range of commits apart from all changes", () => {
    for (const path of ["/o/r/pull/7/changes/b762512924e10469649b0098796eb22d2fd96b52", "/o/r/pull/7/changes/b762512..df11f31", "/o/r/pull/7/files/b762512"]) {
      assert.deepEqual(parsePullRequestPath(path), { owner: "o", repo: "r", number: 7, onDiff: false, onCommits: true }, path);
    }
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

describe("frameCss", () => {
  const frame = { width: 2, color: "red" };

  it("frames rows as one box: top on the first, bottom on the last, sides on every row", () => {
    const css = frameCss(["A", "B", "C"], frame).split("\n");
    assert.deepEqual(css, [
      "A > td { box-shadow: inset 0 2px 0 red; }",
      "A > td:first-child { box-shadow: inset 0 2px 0 red, inset 2px 0 0 red; }",
      "A > td:last-child { box-shadow: inset 0 2px 0 red, inset -2px 0 0 red; }",
      "B > td:first-child { box-shadow: inset 2px 0 0 red; }",
      "B > td:last-child { box-shadow: inset -2px 0 0 red; }",
      "C > td { box-shadow: inset 0 -2px 0 red; }",
      "C > td:first-child { box-shadow: inset 0 -2px 0 red, inset 2px 0 0 red; }",
      "C > td:last-child { box-shadow: inset 0 -2px 0 red, inset -2px 0 0 red; }",
    ]);
  });

  it("closes a single row on all four sides and takes a specificity prefix", () => {
    assert.match(frameCss(["A"], frame, "html "), /^html A > td:first-child \{ box-shadow: inset 0 2px 0 red, inset 0 -2px 0 red, inset 2px 0 0 red; \}$/m);
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
