// Everything that touches GitHub's pull request "Files changed" page.
//
// Verified against the 2026 "changes" UI:
// - each file is a container with id "diff-" + sha256(path)
// - each diff line cell carries data-line-anchor="diff-<sha>R<n>" (new side) or "...L<n>" (old side)
// - large files are collapsed behind a "Load Diff" button; markdown shows a rendered view
//   and binaries have no line cells, so those steps fall back to the file itself
// - changing location.hash does not scroll, so we scroll ourselves
// - comment bodies are server-rendered (.comment-body) on the Conversation page

import { i18nError } from "./i18n.js";
import { findTourInBlocks } from "./tour.js";

// Highlights are CSS rules keyed on GitHub's own anchors rather than classes on elements:
// React re-renders (e.g. after "Load Diff") replace the nodes and would drop our classes.
const HIGHLIGHT_STYLE_ID = "prdocent-highlight";
const EMPHASIS_STYLE_ID = "prdocent-emphasis";
const FILE_STYLE = "outline: 3px solid #8250df; outline-offset: 2px; border-radius: 6px;";
const READING_LINE = 0.25;
// Spotlight: every other diff cell fades so only the step's lines stand out. The step's rows
// win because their selector is more specific (the :has() argument counts). The step is framed
// rather than tinted, so GitHub's own green and red for added and removed lines stay visible.
const DIM_STYLE = `[id^="diff-"] tr > td { opacity: 0.2; transition: opacity 0.3s; }`;
const STEP_FRAME = { width: 2, color: "rgba(130, 80, 223, 0.7)" };
// Emphasis: the lines the narration is talking about right now get a heavier frame.
const EMPHASIS_FRAME = { width: 4, color: "#a371f7" };
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
    const { page } = await fetchConversation(pr);
    const blocks = [...page.querySelectorAll(".comment-body pre")].map((pre) => pre.textContent);
    return findTourInBlocks(blocks, pr);
  } catch {
    return null;
  }
}

/** Title, description and head commit of the PR, which local generation hands to Claude. */
export async function fetchPullRequestDetails(pr) {
  const { html, page } = await fetchConversation(pr);
  const headSha = html.match(/"headSha":"([0-9a-f]{40})"/)?.[1] ?? [...page.querySelectorAll('input[name="oid"]')].at(-1)?.value;
  if (!headSha) throw i18nError("headNotFound");
  return {
    title: page.querySelector("h1")?.textContent.trim().replace(/\s*-\s*#\d+$/, "") || document.title,
    body: page.querySelector(".comment-body")?.textContent.trim() ?? "",
    headSha,
  };
}

async function fetchConversation(pr) {
  const response = await fetch(`/${pr.owner}/${pr.repo}/pull/${pr.number}`, { credentials: "include" });
  if (!response.ok) throw i18nError("prPageFailed", response.status);
  const html = await response.text();
  return { html, page: new DOMParser().parseFromString(html, "text/html") };
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
/**
 * Selectors for every diff row from the first to the last of [present], including rows a line
 * range can't name, such as deleted lines between kept ones, so the step shows them in red rather
 * than fading them out. Keyed on each row's own line anchor, which survives React re-renders.
 */
function rowsBetween(present) {
  const selectors = [];
  for (let row = present[0]?.closest("tr"); row; row = row.nextElementSibling) {
    const anchor = row.querySelector(":scope > td[data-line-anchor]")?.dataset.lineAnchor;
    if (anchor) selectors.push(`tr:has(> td[data-line-anchor="${anchor}"])`);
    if (row === present.at(-1).closest("tr")) break;
  }
  return selectors;
}

/**
 * CSS that draws one frame around consecutive table rows: a diff is a table, so each cell gets
 * inset shadows for the edges it sits on (top of the first row, bottom of the last, the left of
 * first cells and the right of last cells). [prefix] raises specificity over earlier frames.
 */
export function frameCss(rows, { width, color }, prefix = "") {
  const edge = { top: `inset 0 ${width}px 0 ${color}`, bottom: `inset 0 -${width}px 0 ${color}`, left: `inset ${width}px 0 0 ${color}`, right: `inset -${width}px 0 0 ${color}` };
  return rows.map((sel, i) => {
    const vertical = [i === 0 && edge.top, i === rows.length - 1 && edge.bottom].filter(Boolean);
    const rule = (cell, sides) => (sides.length ? `${prefix}${sel} > td${cell} { box-shadow: ${sides.join(", ")}; }` : "");
    return [rule("", vertical), rule(":first-child", [...vertical, edge.left]), rule(":last-child", [...vertical, edge.right])].filter(Boolean).join("\n");
  }).join("\n");
}

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
      const shown = rowsBetween(present);
      setHighlight(`${DIM_STYLE}
        ${shown.map((sel) => `${sel} > td`).join(",\n")} { opacity: 1; }
        ${frameCss(shown, STEP_FRAME)}`);
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
  const stepPresent = rowSelectors(hash, step.side, step.lines).map((sel) => document.querySelector(sel)).filter(Boolean);
  const stepRows = rowsBetween(stepPresent);
  const shown = rowsBetween(present);
  // "html" makes these rules more specific than the step highlight, whatever the style order.
  setStyle(EMPHASIS_STYLE_ID, `${stepRows.map((sel) => `html ${sel} > td`).join(",\n")} { opacity: 0.45; }
    ${shown.map((sel) => `html ${sel} > td`).join(",\n")} { opacity: 1; }
    ${frameCss(shown, EMPHASIS_FRAME, "html ")}`);
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
