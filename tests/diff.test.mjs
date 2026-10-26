import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { changedLineCount, checkTour, formatRanges, visibleLines } from "../src/diff.js";
import { parseTour } from "../src/tour.js";

const diff = `diff --git a/src/a.js b/src/a.js
index 1111111..2222222 100644
--- a/src/a.js
+++ b/src/a.js
@@ -10,4 +10,5 @@ export function a() {
 keep10
-old11
+new11
+new12
 keep12
--- sql comment that was deleted
@@ -40,2 +41,2 @@
 ctx40
 ctx41
diff --git a/img/logo.png b/img/logo.png
new file mode 100644
Binary files /dev/null and b/img/logo.png differ
diff --git a/gone.txt b/gone.txt
deleted file mode 100644
--- a/gone.txt
+++ /dev/null
@@ -1,2 +0,0 @@
-one
-two
`;

const tourWith = (steps, skipped = []) =>
  parseTour({ version: 1, pr: { owner: "o", repo: "r", number: 1 }, chapters: [{ title: "A", steps }], skipped }).tour;

describe("visibleLines", () => {
  const files = visibleLines(diff);

  it("tracks new and old line numbers through a hunk", () => {
    assert.deepEqual([...files.get("src/a.js").right], [10, 11, 12, 13, 41, 42]);
    assert.deepEqual([...files.get("src/a.js").left], [10, 11, 12, 13, 40, 41]);
  });

  it("reads a deleted line starting with -- as content, not a header", () => {
    assert.ok(files.get("src/a.js").left.has(13));
  });

  it("lists binary and deleted files", () => {
    assert.deepEqual([...files.keys()], ["src/a.js", "img/logo.png", "gone.txt"]);
    assert.deepEqual([...files.get("gone.txt").left], [1, 2]);
  });
});

describe("checkTour", () => {
  const files = visibleLines(diff);
  const skipRest = [{ file: "img/logo.png" }, { file: "gone.txt" }];

  it("accepts lines shown in the diff", () => {
    const tour = tourWith([{ file: "src/a.js", lines: [10, 13], note: [{ text: "x", lines: [11, 12] }] }], skipRest);
    assert.deepEqual(checkTour(tour, files), []);
  });

  it("reports hidden lines with what is shown", () => {
    const tour = tourWith([{ file: "src/a.js", lines: [12, 15] }], skipRest);
    assert.deepEqual(checkTour(tour, files), [
      "chapters[0].steps[0] (src/a.js): lines 14-15 are not shown in the diff (right side shows 10-13, 41-42)",
    ]);
  });

  it("checks the left side for deleted lines", () => {
    const tour = tourWith([{ file: "gone.txt", side: "left", lines: [1, 2] }], [{ file: "src/a.js" }, { file: "img/logo.png" }]);
    assert.deepEqual(checkTour(tour, files), []);
  });

  it("reports beats outside their step, files outside the PR and uncovered files", () => {
    const tour = tourWith([
      { file: "src/a.js", lines: [10, 11], note: [{ text: "x", lines: [12, 12] }] },
      { file: "src/other.js" },
    ]);
    assert.deepEqual(checkTour(tour, files), [
      "chapters[0].steps[0] (src/a.js) note[0]: lines 12 must be inside the step's lines",
      "chapters[0].steps[1] (src/other.js): file is not changed in this pull request",
      'img/logo.png: changed but neither visited by a step nor listed in "skipped"',
      'gone.txt: changed but neither visited by a step nor listed in "skipped"',
    ]);
  });
});

describe("changedLineCount", () => {
  it("counts added and removed lines, not headers or context", () => {
    assert.equal(changedLineCount(diff), 6);
  });
});

describe("repeated steps", () => {
  it("are reported", () => {
    const step = { file: "src/a.js", lines: [10, 11] };
    const errors = checkTour(tourWith([step, step], [{ file: "img/logo.png" }, { file: "gone.txt" }]), visibleLines(diff));
    assert.deepEqual(errors, ["chapters[0].steps[1] (src/a.js): repeats an earlier step on the same lines"]);
  });
});

describe("formatRanges", () => {
  it("collapses consecutive numbers", () => {
    assert.equal(formatRanges([9, 1, 2, 3, 7, 10]), "1-3, 7, 9-10");
    assert.equal(formatRanges([]), "none");
  });
});
