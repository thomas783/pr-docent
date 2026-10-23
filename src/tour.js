// Tour model: validation, flattening and coverage. Pure functions — no DOM, no chrome.*.
//
// A tour (version 1):
// {
//   "version": 1,
//   "pr": { "owner": "your-org", "repo": "your-repo", "number": 42 },
//   "title": "...", "summary": "...",
//   "chapters": [{ "title": "...", "summary": "...", "steps": [
//     { "file": "path/in/repo.kt", "lines": [10, 24], "side": "right", "level": "focus", "note": "..." }
//   ]}],
//   "skipped": [{ "file": "server/gradlew", "reason": "generated wrapper" }]
// }
// lines and side are optional (without lines the step points at the whole file);
// level is focus | skim | skip.

export const LEVELS = ["focus", "skim", "skip"];

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
      let lines = null;
      if (step.lines !== undefined) {
        const [start, end] = Array.isArray(step.lines) ? step.lines : [];
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
          fail(`${where}.lines must be [start, end] with 1 <= start <= end`);
        } else {
          lines = [start, end];
        }
      }
      const side = step.side ?? "right";
      if (side !== "left" && side !== "right") fail(`${where}.side must be "left" or "right"`);
      const level = step.level ?? "skim";
      if (!LEVELS.includes(level)) fail(`${where}.level must be one of ${LEVELS.join(", ")}`);
      return { file: step.file, lines, side, level, note: String(step.note ?? "") };
    });
    return { title: String(chapter.title ?? ""), summary: String(chapter.summary ?? ""), steps };
  });

  const skipped = (raw.skipped || []).map((s) => ({ file: String(s.file ?? ""), reason: String(s.reason ?? "") }));
  if (errors.length) return { tour: null, errors };
  return {
    tour: {
      version: 1,
      pr: { owner: pr.owner, repo: pr.repo, number: pr.number },
      title: String(raw.title ?? ""),
      summary: String(raw.summary ?? ""),
      chapters,
      skipped,
    },
    errors: [],
  };
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

/** The bundled tour file name for a PR, e.g. "your-org--your-repo--42.json". */
export function tourFileName({ owner, repo, number }) {
  return `${owner}--${repo}--${number}.json`;
}
