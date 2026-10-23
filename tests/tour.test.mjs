import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { flattenSteps, parseTour, readingSeconds, tourFileName, uncoveredFiles } from "../src/tour.js";

const valid = {
  version: 1,
  pr: { owner: "o", repo: "r", number: 7 },
  title: "T",
  chapters: [
    { title: "A", steps: [{ file: "a.kt", lines: [1, 3], level: "focus", note: "first" }, { file: "b.kt" }] },
    { title: "B", summary: "s", steps: [{ file: "c.kt", side: "left", lines: [5, 5] }] },
  ],
  skipped: [{ file: "gradlew", reason: "generated" }],
};

describe("parseTour", () => {
  it("normalizes defaults", () => {
    const { tour, errors } = parseTour(valid);
    assert.deepEqual(errors, []);
    assert.deepEqual(tour.chapters[0].steps[1], { file: "b.kt", lines: null, side: "right", level: "skim", note: "" });
    assert.equal(tour.chapters[1].steps[0].side, "left");
  });

  it("collects every problem instead of stopping at the first", () => {
    const { tour, errors } = parseTour({
      version: 2,
      pr: { owner: "o" },
      chapters: [{ steps: [{ file: "", lines: [5, 2], side: "middle", level: "urgent" }] }],
    });
    assert.equal(tour, null);
    assert.equal(errors.length, 7);
    assert.match(errors.join("\n"), /version/);
    assert.match(errors.join("\n"), /lines must be/);
  });

  it("rejects non-objects and empty tours", () => {
    assert.equal(parseTour(null).tour, null);
    assert.match(parseTour({ version: 1, pr: { owner: "o", repo: "r", number: 1 }, chapters: [] }).errors[0], /chapter/);
  });
});

describe("flattenSteps", () => {
  it("keeps chapter positions", () => {
    const steps = flattenSteps(parseTour(valid).tour);
    assert.deepEqual(steps.map((s) => [s.file, s.chapterIndex, s.stepIndex]), [["a.kt", 0, 0], ["b.kt", 0, 1], ["c.kt", 1, 0]]);
    assert.equal(steps[2].chapterTitle, "B");
  });
});

describe("uncoveredFiles", () => {
  it("lists PR files neither visited nor skipped", () => {
    const tour = parseTour(valid).tour;
    assert.deepEqual(uncoveredFiles(tour, ["a.kt", "gradlew", "d.kt", "c.kt", "e.ts"]), ["d.kt", "e.ts"]);
  });
});

describe("helpers", () => {
  it("reading time has a floor", () => {
    assert.equal(readingSeconds("short"), 4);
    assert.equal(readingSeconds("x".repeat(120)), 10);
  });
  it("names bundled tour files", () => {
    assert.equal(tourFileName({ owner: "your-org", repo: "your-repo", number: 42 }), "your-org--your-repo--42.json");
  });
});
