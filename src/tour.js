// Tour model: validation, flattening and coverage. Pure functions — no DOM, no chrome.*.
//
// A tour (version 1):
// {
//   "version": 1,
//   "pr": { "owner": "your-org", "repo": "your-repo", "number": 42 },
//   "title": "...", "summary": "...",
//   "chapters": [{ "title": "...", "summary": "...", "steps": [
//     { "file": "path/in/repo.kt", "lines": [10, 24], "side": "right", "level": "focus", "note": "...", "point": "..." }
//   ]}],
//   "skipped": [{ "file": "server/gradlew", "reason": "generated wrapper" }]
// }
// lines and side are optional (without lines the step points at the whole file);
// level is focus | skim | skip; point (optional) is what the reviewer should check.
// note is a string, or a list of beats that each point at the lines they talk about:
//   "note": [{ "text": "findFocus finds ...", "lines": [58, 63] }, { "text": "..." }]

export const LEVELS = ["focus", "skim", "skip"];

const SHA = /^[0-9a-f]{40}$/;

/**
 * The commits a tour was made for, when its generator recorded them: the PR's head commit and the
 * diff's base (the merge base with the target branch). Written by the tools, never by Claude.
 */
function revisionOf(pr) {
  return SHA.test(pr.head ?? "") ? { head: pr.head, ...(SHA.test(pr.base ?? "") ? { base: pr.base } : {}) } : {};
}

/**
 * Whether a tour still matches the PR, given the PR's current { head, base, commits }:
 * "current"; "added" (new commits on top); "rewritten" (force push, rebase, fixup: the tour's
 * head is gone from the PR's commits); "base" (same commits against a different base, such as a
 * retargeted PR); "unknown" (the tour doesn't say, or the PR couldn't be read).
 * Commit ids cover all history below them, so an unchanged head means unchanged commits.
 */
export function tourFreshness(tourPr, current) {
  if (!tourPr?.head || !current?.head) return "unknown";
  if (tourPr.head !== current.head) return current.commits?.includes(tourPr.head) ? "added" : "rewritten";
  return tourPr.base && current.base && tourPr.base !== current.base ? "base" : "current";
}

/** Of the tour made here and the one posted in the comments, the one to play: a current one first, then the local one. */
export function pickTour(local, posted, current) {
  const fresh = (raw) => raw && tourFreshness(raw.pr, current) === "current";
  if (fresh(local) || !fresh(posted)) return local ?? posted;
  return posted;
}

/** Validates and normalizes raw JSON. Returns { tour, errors }; tour is null when there are errors. */
export function parseTour(raw) {
  const errors = [];
  const fail = (msg) => errors.push(msg);
  if (!raw || typeof raw !== "object") return { tour: null, errors: ["Tour must be a JSON object"] };
  if (raw.version !== 1) fail(`Unsupported tour version: ${raw.version}`);

  const pr = raw.pr || {};
  if (!pr.owner || !pr.repo || !Number.isInteger(pr.number)) fail("pr.owner, pr.repo and pr.number are required");
  if (!Array.isArray(raw.chapters) || raw.chapters.length === 0) fail("At least one chapter is required");

  const chapters = (raw.chapters || []).map((chapter, c) => {
    if (!chapter.title) fail(`chapters[${c}].title is required`);
    if (!Array.isArray(chapter.steps) || chapter.steps.length === 0) fail(`chapters[${c}] needs at least one step`);
    const steps = (chapter.steps || []).map((step, s) => {
      const where = `chapters[${c}].steps[${s}]`;
      if (typeof step.file !== "string" || !step.file) fail(`${where}.file is required`);
      const lines = parseLines(step.lines, where, fail);
      const side = step.side ?? "right";
      if (side !== "left" && side !== "right") fail(`${where}.side must be "left" or "right"`);
      const level = step.level ?? "skim";
      if (!LEVELS.includes(level)) fail(`${where}.level must be one of ${LEVELS.join(", ")}`);
      if (step.point !== undefined && typeof step.point !== "string") fail(`${where}.point must be a string`);
      const beats = parseBeats(step.note, where, fail);
      const note = beats.map((beat) => beat.text).join(" ");
      return { file: step.file, lines, side, level, note, beats, point: step.point ?? "" };
    });
    return { title: String(chapter.title ?? ""), summary: String(chapter.summary ?? ""), steps };
  });

  const skipped = (raw.skipped || []).map((s) => ({ file: String(s.file ?? ""), reason: String(s.reason ?? "") }));
  if (errors.length) return { tour: null, errors };
  return {
    tour: {
      version: 1,
      pr: { owner: pr.owner, repo: pr.repo, number: pr.number, ...revisionOf(pr) },
      title: String(raw.title ?? ""),
      summary: String(raw.summary ?? ""),
      chapters,
      skipped,
    },
    errors: [],
  };
}

/** [start, end] line range, or null when absent; reports a malformed one through [fail]. */
function parseLines(value, where, fail) {
  if (value === undefined) return null;
  const [start, end] = Array.isArray(value) ? value : [];
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    fail(`${where}.lines must be [start, end] with 1 <= start <= end`);
    return null;
  }
  return [start, end];
}

/** A note as beats: a plain string is one beat that points at no particular lines. */
function parseBeats(note, where, fail) {
  if (!Array.isArray(note)) return note ? [{ text: String(note), lines: null }] : [];
  return note.map((beat, b) => {
    const at = `${where}.note[${b}]`;
    if (typeof beat?.text !== "string" || !beat.text) fail(`${at}.text is required`);
    return { text: String(beat?.text ?? ""), lines: parseLines(beat?.lines, at, fail) };
  });
}

/** Every step in order, with its chapter index and its position inside the chapter. */
export function flattenSteps(tour) {
  return tour.chapters.flatMap((chapter, chapterIndex) =>
    chapter.steps.map((step, stepIndex) => ({ ...step, chapterIndex, stepIndex, chapterTitle: chapter.title })),
  );
}

/** PR files the tour neither visits nor explicitly skips — the reviewer must look at these alone. */
export function uncoveredFiles(tour, prFiles) {
  const covered = new Set([
    ...tour.chapters.flatMap((c) => c.steps.map((s) => s.file)),
    ...tour.skipped.map((s) => s.file),
  ]);
  return prFiles.filter((file) => !covered.has(file));
}

/** Seconds a step stays on screen when narration is off: roughly reading speed, at least 4s. */
export function readingSeconds(text) {
  return Math.max(4, Math.round(String(text).length / 12));
}

/**
 * Splits narration into sentences, each with its offset in [text], so it can be read (and
 * resumed) a sentence at a time. A period after a digit ("2. 집중 단계") is a list number,
 * not a sentence end.
 */
export function splitSentences(text) {
  const sentences = [];
  const pattern = /[^\d\s][.!?](?=\s)/g;
  let start = 0;
  for (let match; (match = pattern.exec(text)); ) {
    const end = match.index + match[0].length;
    pushSentence(sentences, text, start, end);
    start = end;
  }
  pushSentence(sentences, text, start, text.length);
  return sentences;
}

function pushSentence(sentences, text, start, end) {
  const raw = text.slice(start, end);
  const trimmed = raw.trim();
  if (trimmed) sentences.push({ start: start + raw.indexOf(trimmed), text: trimmed });
}

/**
 * What to say for a step, one sentence per unit, each with the lines to point at while it
 * is read (null: just the step's own range). Opens with the chapter title when given and
 * ends with the review point.
 */
export function narrationUnits(step, { chapterTitle = "", pointLabel = "" } = {}) {
  const units = [];
  const add = (text, lines) => splitSentences(text).forEach((s) => units.push({ text: s.text, lines }));
  if (chapterTitle) add(`${chapterTitle}.`, null);
  for (const beat of step.beats) add(beat.text, beat.lines);
  if (step.point) add(`${pointLabel}: ${step.point}`, null);
  return units;
}

/**
 * The tour for [pr] among code blocks of the PR's comments (the generator posts it as a
 * JSON block): the last block that parses as a version 1 tour of this PR, or null.
 */
export function findTourInBlocks(blocks, { owner, repo, number }) {
  let found = null;
  for (const text of blocks) {
    let raw;
    try {
      raw = JSON.parse(text);
    } catch {
      continue;
    }
    const forThisPr = raw?.version === 1 && raw.pr?.owner === owner && raw.pr?.repo === repo && raw.pr?.number === number;
    if (forThisPr && Array.isArray(raw.chapters)) found = raw; // a short in the same comment has scenes instead
  }
  return found;
}

/** "ko" when the tour's text has Hangul, otherwise "en": the language to narrate it in. */
export function tourLanguage(tour) {
  const text = [
    tour.title,
    tour.summary,
    ...tour.chapters.flatMap((c) => [c.title, c.summary]),
    ...flattenSteps(tour).flatMap((s) => [s.note, s.point]),
  ].join(" ");
  return /[가-힣]/.test(text) ? "ko" : "en";
}

/** The bundled tour file name for a PR, e.g. "your-org--your-repo--42.json". */
export function tourFileName({ owner, repo, number }) {
  return `${owner}--${repo}--${number}.json`;
}
