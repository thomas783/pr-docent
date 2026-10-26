import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findTourInBlocks, flattenSteps, narrationUnits, parseTour, readingSeconds, splitSentences, tourFileName, uncoveredFiles } from "../src/tour.js";

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
    assert.deepEqual(tour.chapters[0].steps[1], { file: "b.kt", lines: null, side: "right", level: "skim", note: "", beats: [], point: "" });
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

  it("keeps a review point and rejects a non-string one", () => {
    const tour = (point) => ({ ...valid, chapters: [{ title: "A", steps: [{ file: "a.kt", point }] }] });
    assert.equal(parseTour(tour("check the guard")).tour.chapters[0].steps[0].point, "check the guard");
    assert.match(parseTour(tour(3)).errors[0], /point must be a string/);
  });

  it("reads a note as beats that point at lines", () => {
    const note = [{ text: "First.", lines: [3, 5] }, { text: "Then this." }];
    const { tour } = parseTour({ ...valid, chapters: [{ title: "A", steps: [{ file: "a.kt", note }] }] });
    const step = tour.chapters[0].steps[0];
    assert.deepEqual(step.beats, [{ text: "First.", lines: [3, 5] }, { text: "Then this.", lines: null }]);
    assert.equal(step.note, "First. Then this.");
  });

  it("reports malformed beats", () => {
    const note = [{ lines: [3, 5] }, { text: "x", lines: [9, 2] }];
    const { errors } = parseTour({ ...valid, chapters: [{ title: "A", steps: [{ file: "a.kt", note }] }] });
    assert.deepEqual(errors, ["chapters[0].steps[0].note[0].text is required", "chapters[0].steps[0].note[1].lines must be [start, end] with 1 <= start <= end"]);
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

describe("splitSentences", () => {
  it("splits on sentence ends and keeps offsets into the text", () => {
    const text = "2. 집중 단계로 건너뛰기. 없으면 -1을 돌려줍니다. 경계를 보세요";
    const sentences = splitSentences(text);
    assert.deepEqual(sentences.map((s) => s.text), ["2. 집중 단계로 건너뛰기.", "없으면 -1을 돌려줍니다.", "경계를 보세요"]);
    for (const s of sentences) assert.equal(text.slice(s.start, s.start + s.text.length), s.text);
  });

  it("does not split version numbers or a trailing period", () => {
    assert.deepEqual(splitSentences("v1.2 버전입니다.").map((s) => s.text), ["v1.2 버전입니다."]);
    assert.deepEqual(splitSentences("  "), []);
  });
});

describe("narrationUnits", () => {
  it("reads the chapter, each beat's sentences with its lines, then the point", () => {
    const step = { beats: [{ text: "Finds it. Returns -1.", lines: [3, 5] }, { text: "Moves.", lines: null }], point: "Check edges." };
    assert.deepEqual(narrationUnits(step, { chapterTitle: "2. Focus", pointLabel: "Point" }), [
      { text: "2. Focus.", lines: null },
      { text: "Finds it.", lines: [3, 5] },
      { text: "Returns -1.", lines: [3, 5] },
      { text: "Moves.", lines: null },
      { text: "Point: Check edges.", lines: null },
    ]);
  });
});

describe("findTourInBlocks", () => {
  const pr = { owner: "o", repo: "r", number: 7 };
  const tour = (number, title) => JSON.stringify({ version: 1, pr: { owner: "o", repo: "r", number }, title });

  it("picks the last tour of this PR and ignores other code blocks", () => {
    const blocks = ["npm test", "{ not json", tour(7, "old"), tour(8, "other PR"), '{"version":2}', tour(7, "new")];
    assert.equal(findTourInBlocks(blocks, pr).title, "new");
  });

  it("returns null when no block is a tour of this PR", () => {
    assert.equal(findTourInBlocks([tour(8, "x"), "[]"], pr), null);
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
