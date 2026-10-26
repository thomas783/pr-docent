// Everything that touches GitHub's pull request "Files changed" page.
//
// Verified against the 2026 "changes" UI:
// - each file is a container with id "diff-" + sha256(path)
// - each diff line cell carries data-line-anchor="diff-<sha>R<n>" (new side) or "...L<n>" (old side)
// - large files are collapsed behind a "Load Diff" button; markdown shows a rendered view
//   and binaries have no line cells, so those steps fall back to the file itself
// - changing location.hash does not scroll, so we scroll ourselves
// - comment bodies are server-rendered (.comment-body) on the Conversation page

import { findTourInBlocks } from "./tour.js";

// Highlights are CSS rules keyed on GitHub's own anchors rather than classes on elements:
// React re-renders (e.g. after "Load Diff") replace the nodes and would drop our classes.
const HIGHLIGHT_STYLE_ID = "prdocent-highlight";
const EMPHASIS_STYLE_ID = "prdocent-emphasis";
const ROW_STYLE = "background-color: rgba(130, 80, 223, 0.16) !important;";
const FILE_STYLE = "outline: 3px solid #8250df; outline-offset: 2px; border-radius: 6px;";
const READING_LINE = 0.25;
// Spotlight: every other diff cell fades so only the step's lines stand out. The step's rows
// win because their selector is more specific (the :has() argument counts).
const DIM_STYLE = `[id^="diff-"] tr > td { opacity: 0.2; transition: opacity 0.3s, background-color 0.3s; }`;
// Emphasis: the lines the narration is talking about right now, inside the step's range.
const EMPHASIS_ROW_STYLE = "background-color: rgba(130, 80, 223, 0.36) !important; opacity: 1;";
const STICKY_HEADER_HEIGHT = 80;

/** Parses /:owner/:repo/pull/:number[/files|/changes] — null when not a PR page. */
export function parsePullRequestPath(pathname) {
  const match = pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/(files|changes))?\/?$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2], number: Number(match[3]), onDiff: Boolean(match[4]) };
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The tour posted in the PR's comments (by the generate-tour workflow), or null. Reads the
 * Conversation page with the viewer's own session, so it works on private repositories too.
 */
export async function fetchCommentTour(pr) {
  try {
    const response = await fetch(`/${pr.owner}/${pr.repo}/pull/${pr.number}`, { credentials: "include" });
    if (!response.ok) return null;
    const page = new DOMParser().parseFromString(await response.text(), "text/html");
    const blocks = [...page.querySelectorAll(".comment-body pre")].map((pre) => pre.textContent);
    return findTourInBlocks(blocks, pr);
  } catch {
    return null;
  }
}

/** Paths of every file in the PR, read from the diff containers' headers. */
export function listPullRequestFiles() {
  return [...document.querySelectorAll('[id^="diff-"][data-estimated-height]')]
    .map((el) => el.textContent.match(/\u200e([^\u200e]+)\u200e/)?.[1])
    .filter(Boolean);
}

/**
 * Expands a collapsed file ("Load Diff") and waits for its lines. GitHub only wires up files
 * near the viewport, so scroll there first and retry; re-query by id because the node is replaced.
 */
async function ensureRendered(fileId) {
  const container = () => document.getElementById(fileId);
  const hasRows = () => Boolean(container()?.querySelector("tr.diff-line-row"));
  const loadButton = () => [...(container()?.querySelectorAll("button") ?? [])].find((b) => /load diff/i.test(b.textContent));
  for (let attempt = 0; attempt < 3 && !hasRows(); attempt++) {
    container()?.scrollIntoView({ block: "start" });
    // The file's content (lines or the button) is drawn once it's near the viewport.
    await waitFor(() => hasRows() || loadButton(), 2000);
    const load = loadButton();
    if (hasRows() || !load) return;
    load.click();
    await waitFor(hasRows, 1500);
  }
}

async function waitFor(condition, timeoutMs) {
  for (let waited = 0; waited < timeoutMs && !condition(); waited += 100) await sleep(100);
}

/** CSS selectors for the diff rows of [start, end] on one side of a file. */
export function rowSelectors(hash, side, [start, end]) {
  const letter = side === "left" ? "L" : "R";
  const selectors = [];
  for (let line = start; line <= end; line++) {
    selectors.push(`tr:has(> td[data-line-anchor="diff-${hash}${letter}${line}"])`);
  }
  return selectors;
}

/**
 * Scrolls to a step and highlights it. Returns what was found, so the panel can say
 * when a file or line isn't on the page (e.g. the tour is for another revision).
 */
export async function focusStep(step) {
  const hash = await sha256Hex(step.file);
  const fileId = `diff-${hash}`;
  setStyle(EMPHASIS_STYLE_ID, "");
  if (!document.getElementById(fileId)) {
    setHighlight("");
    return { found: "none" };
  }

  if (step.lines) {
    await ensureRendered(fileId);
    const rows = rowSelectors(hash, step.side, step.lines);
    const present = rows.map((sel) => document.querySelector(sel)).filter(Boolean);
    if (present.length) {
      setHighlight(`${DIM_STYLE}
        ${rows.map((sel) => `${sel} > td`).join(",\n")} { ${ROW_STYLE} opacity: 1; }
        ${rows.map((sel) => `${sel} > td:first-child`).join(",\n")} { box-shadow: inset 3px 0 0 #8250df; }`);
      await scrollToReadingLine(firstShown(rows));
      return { found: "lines", count: present.length };
    }
  }
  setHighlight(`#${fileId} { ${FILE_STYLE} }`);
  await scrollToReadingLine(() => document.getElementById(fileId));
  return { found: "file" };
}

/**
 * Points at [lines] within the focused step while the narration talks about them: those rows
 * get a stronger tint and the rest of the step fades a little. null clears the emphasis.
 * Scrolls only when the lines aren't fully on screen, so the view stays put within a step.
 */
export async function emphasize(step, lines) {
  if (!lines || !step.lines) return setStyle(EMPHASIS_STYLE_ID, "");
  const hash = await sha256Hex(step.file);
  const rows = rowSelectors(hash, step.side, lines);
  const present = rows.map((sel) => document.querySelector(sel)).filter(Boolean);
  if (!present.length) return setStyle(EMPHASIS_STYLE_ID, "");
  const stepRows = rowSelectors(hash, step.side, step.lines);
  // "html" makes these rules more specific than the step highlight, whatever the style order.
  setStyle(EMPHASIS_STYLE_ID, `${stepRows.map((sel) => `html ${sel} > td`).join(",\n")} { opacity: 0.45; }
    ${rows.map((sel) => `html ${sel} > td`).join(",\n")} { ${EMPHASIS_ROW_STYLE} }`);
  const top = present[0].getBoundingClientRect().top;
  const bottom = present.at(-1).getBoundingClientRect().bottom;
  if (top < STICKY_HEADER_HEIGHT || bottom > window.innerHeight) await scrollToReadingLine(firstShown(rows));
}

/** Finds the first of [rows] on the page at call time (React may have replaced the nodes). */
function firstShown(rows) {
  return () => rows.map((sel) => document.querySelector(sel)).find(Boolean) ?? null;
}

/**
 * Every step lands at the same height (a quarter down the viewport), so the reader's
 * eyes stay in one place; "start" would also hide the target under GitHub's sticky headers.
 */
async function scrollToReadingLine(find) {
  const offset = () => {
    const element = find();
    return element ? element.getBoundingClientRect().top - window.innerHeight * READING_LINE : null;
  };
  const first = offset();
  if (first === null || Math.abs(first) < 24) return;
  window.scrollTo({ top: Math.max(0, window.scrollY + first), behavior: "smooth" });
  await new Promise((resolve) => {
    window.addEventListener("scrollend", resolve, { once: true });
    setTimeout(resolve, 1500);
  });
  // Files between the start and the target render lazily as they scroll past and grow,
  // pushing the target down; follow it until it stays put.
  for (let i = 0; i < 5; i++) {
    const drift = offset();
    if (drift === null || Math.abs(drift) < 24 || window.scrollY + drift < 0) return;
    window.scrollTo({ top: window.scrollY + drift, behavior: "instant" });
    await sleep(300);
  }
}

export function clearHighlight() {
  setHighlight("");
  setStyle(EMPHASIS_STYLE_ID, "");
}

function setHighlight(css) {
  setStyle(HIGHLIGHT_STYLE_ID, css);
}

function setStyle(id, css) {
  let style = document.getElementById(id);
  if (!style) {
    style = document.createElement("style");
    style.id = id;
    document.head.append(style);
  }
  style.textContent = css;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
