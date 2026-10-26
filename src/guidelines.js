// How long a generated tour may be, and a repository's own instructions for it.
// Pure functions — no DOM, no chrome.*, no file system.
//
// A repository can add .github/pr-docent.md. Its optional front matter overrides the limits,
// and the rest is appended to the generator's instructions:
//
//   ---
//   maxSteps: 5
//   sentenceChars: 100
//   ---
//   Use the domain terms 원장, 안분 and 파생 라인. Always mark migrations as focus.

import { flattenSteps, splitSentences } from "./tour.js";

export const GUIDELINES_PATH = ".github/pr-docent.md";

export const DEFAULT_LIMITS = {
  maxSteps: null, // null: 3 + 1 per 25 changed lines, at most 20
  sentencesPerStep: 3,
  sentenceChars: 80,
  pointChars: 120,
  summaryChars: 200,
  chapterSummaryChars: 60,
};

/** { limits, instructions, errors } from the text of .github/pr-docent.md (or "" when absent). */
export function parseGuidelines(text) {
  const limits = { ...DEFAULT_LIMITS };
  const errors = [];
  const match = String(text ?? "").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  for (const line of match ? match[1].split(/\r?\n/) : []) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const [, key, value] = line.replace(/\s+#.*$/, "").match(/^\s*(\w+)\s*:\s*(.*?)\s*$/) ?? [];
    if (!key || !(key in DEFAULT_LIMITS)) errors.push(`Unknown setting: ${line.trim()}`);
    else if (!/^\d+$/.test(value) || Number(value) < 1) errors.push(`${key} must be a positive whole number`);
    else limits[key] = Number(value);
  }
  const instructions = String(text ?? "").slice(match ? match[0].length : 0).trim();
  return { limits, instructions, errors };
}

/** How many steps a tour of a diff with [changedLines] added or removed lines may have. */
export function stepBudget(changedLines, limits = DEFAULT_LIMITS) {
  return limits.maxSteps ?? Math.min(20, 3 + Math.ceil(changedLines / 25));
}

/** Problems that make a tour wordier than the limits allow. */
export function checkBrevity(tour, { changedLines, limits = DEFAULT_LIMITS }) {
  const errors = [];
  const steps = flattenSteps(tour);
  const budget = stepBudget(changedLines, limits);
  if (steps.length > budget) {
    errors.push(`${steps.length} steps for ${changedLines} changed lines; at most ${budget}. Merge related steps and list trivial changes (comments, imports, docs, pass-through code) in "skipped".`);
  }
  if (tour.summary.length > limits.summaryChars) errors.push(`summary is ${tour.summary.length} characters; at most ${limits.summaryChars}`);
  tour.chapters.forEach((chapter, c) => {
    if (chapter.summary.length > limits.chapterSummaryChars) {
      errors.push(`chapters[${c}].summary is ${chapter.summary.length} characters; at most ${limits.chapterSummaryChars}`);
    }
    chapter.steps.forEach((step, s) => {
      const where = `chapters[${c}].steps[${s}] (${step.file})`;
      const sentences = step.beats.flatMap((beat) => splitSentences(beat.text).map((x) => x.text));
      if (sentences.length > limits.sentencesPerStep) {
        errors.push(`${where}: ${sentences.length} sentences; at most ${limits.sentencesPerStep}. Keep only what the code doesn't already say.`);
      }
      for (const sentence of sentences) {
        if (sentence.length > limits.sentenceChars) {
          errors.push(`${where}: a sentence is ${sentence.length} characters; at most ${limits.sentenceChars}: "${sentence.slice(0, 30)}…"`);
        }
      }
      if (step.point.length > limits.pointChars) {
        errors.push(`${where}: point is ${step.point.length} characters; at most ${limits.pointChars}. Ask one question.`);
      }
    });
  });
  return errors;
}

/**
 * The generator's instructions: [template] (scripts/tour-prompt.md) with the paths, the limits
 * for this diff and the repository's own instructions filled in.
 */
export function buildPrompt(template, { pr, out, tools, language, changedLines, guidelinesText = "" }) {
  const { limits, instructions } = parseGuidelines(guidelinesText);
  const vars = {
    PR: pr,
    OUT: out,
    TOOLS: tools,
    LANGUAGE: language,
    CHANGED_LINES: changedLines,
    MAX_STEPS: stepBudget(changedLines, limits),
    SENTENCES_PER_STEP: limits.sentencesPerStep,
    SENTENCE_CHARS: limits.sentenceChars,
    POINT_CHARS: limits.pointChars,
    SUMMARY_CHARS: limits.summaryChars,
    CHAPTER_SUMMARY_CHARS: limits.chapterSummaryChars,
    GUIDELINES: instructions
      ? `## Repository guidelines (${GUIDELINES_PATH})\n\nThese come from the repository and take precedence over the rules above.\n\n${instructions}\n`
      : "",
  };
  return template.replace(/{{(\w+)}}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}
