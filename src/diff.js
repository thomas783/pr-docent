// Checks a tour against the pull request's diff. Pure functions — no DOM, no chrome.*.
//
// GitHub's Files changed page shows each hunk of a unified diff with 3 lines of context,
// so a tour can only point at lines that appear in `git diff -U3`. Generated tours get
// line numbers wrong easily; this catches that before the tour is published.

/**
 * Lines visible on the Files changed page, per file: { right: Set, left: Set } where right
 * holds new-file line numbers (context and additions) and left old-file ones (context and
 * deletions). Keyed by the new path (the old path for deleted files).
 */
export function visibleLines(diffText) {
  const files = new Map();
  let current = null;
  let inHunk = false;
  let oldLine = 0;
  let newLine = 0;
  for (const line of String(diffText).split("\n")) {
    if (line.startsWith("diff --git ")) {
      // Every file has this header, including binaries and pure renames that have no hunks.
      current = { right: new Set(), left: new Set() };
      files.set(line.slice(line.lastIndexOf(" b/") + 3), current);
      inHunk = false;
    } else if (!current) {
      continue;
    } else if (line.startsWith("@@")) {
      const match = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) [oldLine, newLine] = [Number(match[1]), Number(match[2])];
      inHunk = Boolean(match);
    } else if (!inHunk) {
      continue; // index, mode, rename, ---/+++ headers
    } else if (line.startsWith("+")) {
      current.right.add(newLine++);
    } else if (line.startsWith("-")) {
      current.left.add(oldLine++);
    } else if (line.startsWith(" ")) {
      current.right.add(newLine++);
      current.left.add(oldLine++);
    }
  }
  return files;
}

/**
 * Problems that would make the tour point at the wrong place or skip part of the PR:
 * files outside the diff, lines not shown on the page, beats outside their step, repeated
 * steps, and changed files the tour neither visits nor skips.
 */
export function checkTour(tour, files) {
  const errors = [];
  const visited = new Set();
  const seen = new Set();
  tour.chapters.forEach((chapter, c) =>
    chapter.steps.forEach((step, s) => {
      const where = `chapters[${c}].steps[${s}] (${step.file})`;
      visited.add(step.file);
      const key = `${step.file}|${step.side}|${step.lines}`;
      if (seen.has(key)) errors.push(`${where}: repeats an earlier step on the same lines`);
      seen.add(key);
      const file = files.get(step.file);
      if (!file) return errors.push(`${where}: file is not changed in this pull request`);
      const shown = file[step.side];
      const check = (lines, label) => {
        const missing = range(lines).filter((n) => !shown.has(n));
        if (missing.length) {
          errors.push(`${label}: lines ${formatRanges(missing)} are not shown in the diff (${step.side} side shows ${formatRanges([...shown])})`);
        }
      };
      if (step.lines) check(step.lines, where);
      step.beats.forEach((beat, b) => {
        if (!beat.lines) return;
        if (!step.lines || beat.lines[0] < step.lines[0] || beat.lines[1] > step.lines[1]) {
          errors.push(`${where} note[${b}]: lines ${formatRanges(range(beat.lines))} must be inside the step's lines`);
        } else {
          check(beat.lines, `${where} note[${b}]`);
        }
      });
    }),
  );
  for (const skipped of tour.skipped) visited.add(skipped.file);
  for (const path of files.keys()) {
    if (!visited.has(path)) errors.push(`${path}: changed but neither visited by a step nor listed in "skipped"`);
  }
  return errors;
}

/** Added plus removed lines, which sets how long a tour of the diff may be. */
export function changedLineCount(diffText) {
  let count = 0;
  let inHunk = false;
  for (const line of String(diffText).split("\n")) {
    if (line.startsWith("diff --git ")) inHunk = false;
    else if (line.startsWith("@@")) inHunk = true;
    else if (inHunk && (line.startsWith("+") || line.startsWith("-"))) count++;
  }
  return count;
}

function range([start, end]) {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

/** [1, 2, 3, 7, 9, 10] → "1-3, 7, 9-10" */
export function formatRanges(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(i === j ? `${sorted[i]}` : `${sorted[i]}-${sorted[j]}`);
    i = j + 1;
  }
  return parts.join(", ") || "none";
}
