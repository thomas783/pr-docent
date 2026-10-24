// Everything that touches GitHub's pull request "Files changed" page.
//
// Verified against the 2026 "changes" UI:
// - each file is a container with id "diff-" + sha256(path)
// - each diff line cell carries data-line-anchor="diff-<sha>R<n>" (new side) or "...L<n>" (old side)
// - large files are collapsed behind a "Load Diff" button; markdown shows a rendered view
//   and binaries have no line cells, so those steps fall back to the file itself
// - changing location.hash does not scroll, so we scroll ourselves

// Highlights are CSS rules keyed on GitHub's own anchors rather than classes on elements:
// React re-renders (e.g. after "Load Diff") replace the nodes and would drop our classes.
const HIGHLIGHT_STYLE_ID = "prdocent-highlight";
const ROW_STYLE = "background-color: rgba(130, 80, 223, 0.16) !important;";
const FILE_STYLE = "outline: 3px solid #8250df; outline-offset: 2px; border-radius: 6px;";
const READING_LINE = 0.25;

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
  if (!document.getElementById(fileId)) {
    setHighlight("");
    return { found: "none" };
  }

  if (step.lines) {
    await ensureRendered(fileId);
    const rows = rowSelectors(hash, step.side, step.lines);
    const present = rows.map((sel) => document.querySelector(sel)).filter(Boolean);
    if (present.length) {
      setHighlight(`${rows.map((sel) => `${sel} > td`).join(",\n")} { ${ROW_STYLE} }
        ${rows.map((sel) => `${sel} > td:first-child`).join(",\n")} { box-shadow: inset 3px 0 0 #8250df; }`);
      scrollToReadingLine(present[0]);
      return { found: "lines", count: present.length };
    }
  }
  setHighlight(`#${fileId} { ${FILE_STYLE} }`);
  scrollToReadingLine(document.getElementById(fileId));
  return { found: "file" };
}

/**
 * Every step lands at the same height (a quarter down the viewport), so the reader's
 * eyes stay in one place; "start" would also hide the target under GitHub's sticky headers.
 */
function scrollToReadingLine(element) {
  const top = element.getBoundingClientRect().top + window.scrollY - window.innerHeight * READING_LINE;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

export function clearHighlight() {
  setHighlight("");
}

function setHighlight(css) {
  let style = document.getElementById(HIGHLIGHT_STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = HIGHLIGHT_STYLE_ID;
    document.head.append(style);
  }
  style.textContent = css;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
