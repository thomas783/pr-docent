import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, checkBrevity, DEFAULT_LIMITS, parseGuidelines, stepBudget } from "../src/guidelines.js";
import { parseTour } from "../src/tour.js";

const tourOf = (steps, extra = {}) =>
  parseTour({ version: 1, pr: { owner: "o", repo: "r", number: 1 }, chapters: [{ title: "A", steps }], ...extra }).tour;

describe("parseGuidelines", () => {
  it("reads limits from front matter and keeps the rest as instructions", () => {
    const { limits, instructions, errors } = parseGuidelines("---\nmaxSteps: 5   # 단계 수\n# comment\nsentenceChars: 100\n---\n원장 용어를 쓴다.\n");
    assert.deepEqual(errors, []);
    assert.equal(limits.maxSteps, 5);
    assert.equal(limits.sentenceChars, 100);
    assert.equal(limits.pointChars, DEFAULT_LIMITS.pointChars);
    assert.equal(instructions, "원장 용어를 쓴다.");
  });

  it("treats text without front matter as instructions only", () => {
    assert.deepEqual(parseGuidelines("Just prose.\n"), { limits: DEFAULT_LIMITS, instructions: "Just prose.", errors: [] });
    assert.equal(parseGuidelines(undefined).instructions, "");
  });

  it("reports unknown settings and bad values", () => {
    const { errors } = parseGuidelines("---\nmaxStep: 5\nsentenceChars: lots\n---\n");
    assert.deepEqual(errors, ["Unknown setting: maxStep: 5", "sentenceChars must be a positive whole number"]);
  });
});

describe("stepBudget", () => {
  it("grows with the diff up to 20, unless the repository fixes it", () => {
    assert.equal(stepBudget(76), 7);
    assert.equal(stepBudget(0), 3);
    assert.equal(stepBudget(5000), 20);
    assert.equal(stepBudget(5000, { ...DEFAULT_LIMITS, maxSteps: 4 }), 4);
  });
});

describe("checkBrevity", () => {
  it("passes a short tour", () => {
    const tour = tourOf([{ file: "a.kt", note: [{ text: "짧은 문장입니다." }], point: "경계값은 괜찮을까요?" }]);
    assert.deepEqual(checkBrevity(tour, { changedLines: 10 }), []);
  });

  it("reports too many steps, sentences, long sentences and long points", () => {
    const long = "가".repeat(81);
    const steps = [
      { file: "a.kt", note: `하나. 둘. 셋. ${long}.`, point: "질".repeat(121) },
      { file: "b.kt" }, { file: "c.kt" }, { file: "d.kt" }, { file: "e.kt" },
    ];
    const errors = checkBrevity(tourOf(steps), { changedLines: 10 });
    assert.equal(errors.length, 4);
    assert.match(errors[0], /^5 steps for 10 changed lines; at most 4/);
    assert.match(errors[1], /4 sentences; at most 3/);
    assert.match(errors[2], /a sentence is 82 characters; at most 80/);
    assert.match(errors[3], /point is 121 characters; at most 120/);
  });

  it("uses the repository's limits", () => {
    const tour = tourOf([{ file: "a.kt", note: "가".repeat(90) }]);
    assert.equal(checkBrevity(tour, { changedLines: 10, limits: { ...DEFAULT_LIMITS, sentenceChars: 100 } }).length, 0);
  });
});

describe("buildPrompt", () => {
  const template = "{{PR}} {{MAX_STEPS}} {{SENTENCE_CHARS}} {{UNKNOWN}}\n{{GUIDELINES}}";
  const base = { pr: "o/r#1", out: "/o", tools: "/t", language: "한국어", changedLines: 76 };

  it("fills paths and the limits for this diff", () => {
    assert.equal(buildPrompt(template, base), "o/r#1 7 80 {{UNKNOWN}}\n");
  });

  it("inserts values literally, even with characters special to sed or replace", () => {
    assert.equal(buildPrompt("{{LANGUAGE}}", { ...base, language: "a|b&c $& $1" }), "a|b&c $& $1");
  });

  it("applies the repository's limits and appends its instructions", () => {
    const prompt = buildPrompt(template, { ...base, guidelinesText: "---\nmaxSteps: 4\n---\n마이그레이션은 집중으로." });
    assert.match(prompt, /^o\/r#1 4 80/);
    assert.match(prompt, /## Repository guidelines \(\.github\/pr-docent\.md\)[\s\S]*마이그레이션은 집중으로\./);
  });
});
