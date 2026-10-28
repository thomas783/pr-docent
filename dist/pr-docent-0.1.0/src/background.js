// Service worker: relays the panel's requests to the local host, which runs the user's own
// Claude Code: "generate" writes a tour, "script" a short's script, "render" saves a short as an
// MP4 and "reveal" shows one in Finder. For the first two it fetches the diff and the changed files (host permissions get past the
// cross-origin redirects GitHub uses for .diff and raw files, and the viewer's session covers
// private repositories).

import { visibleLines } from "./diff.js";
import { GUIDELINES_PATH } from "./guidelines.js";

const HOST_NAME = "dev.prdocent.host";
const MAX_FILE_BYTES = 1_000_000;

const HANDLERS = { generate, script, render, reveal };

chrome.runtime.onConnect.addListener((port) => {
  const handler = HANDLERS[port.name];
  if (!handler) return;
  port.onMessage.addListener((request) =>
    handler(port, request).catch((error) => port.postMessage({ type: "error", message: error.message })),
  );
});

async function generate(port, { pr, title, body, headSha, language }) {
  const { base, diff, files } = await collect(port, pr, headSha);
  // The repository's own instructions for tours, if it has any.
  const guidelines = await fetchText(`${base}/raw/${headSha}/${GUIDELINES_PATH}`).catch(() => "");
  port.postMessage({ type: "progress", stage: "claude", seconds: 0 });
  relay(port, { type: "generate", pr, title, body, headSha, diff, files, guidelines, language });
}

async function script(port, { pr, title, body, headSha, tour, language }) {
  const { diff, files } = await collect(port, pr, headSha);
  port.postMessage({ type: "progress", stage: "script", seconds: 0 });
  relay(port, { type: "script", pr, title, body, headSha, tour, diff, files, language });
}

async function render(port, { short }) {
  relay(port, { type: "render", short });
}

async function reveal(port, { path }) {
  relay(port, { type: "reveal", path });
}

/** The PR's diff and the text of its changed files at the head commit. */
async function collect(port, pr, headSha) {
  const base = `https://github.com/${pr.owner}/${pr.repo}`;
  port.postMessage({ type: "progress", stage: "fetch" });
  const diff = await fetchText(`${base}/pull/${pr.number}.diff`);
  const files = {};
  await mapLimit([...visibleLines(diff).keys()], 6, async (path) => {
    // Deleted and binary files have no useful text at the head commit.
    const text = await fetchText(`${base}/raw/${headSha}/${path.split("/").map(encodeURIComponent).join("/")}`).catch(() => null);
    if (text !== null && text.length <= MAX_FILE_BYTES && !text.includes("\u0000")) files[path] = text;
  });
  return { base, diff, files };
}

/** Sends [message] to the native host and passes its replies back to the panel. */
function relay(port, message) {
  const host = chrome.runtime.connectNative(HOST_NAME);
  host.onMessage.addListener((reply) => port.postMessage(reply));
  host.onDisconnect.addListener(() => {
    const error = chrome.runtime.lastError?.message;
    if (error) port.postMessage({ type: "error", message: error, notInstalled: /not found/i.test(error) });
  });
  port.onDisconnect.addListener(() => host.disconnect());
  host.postMessage(message);
}

async function fetchText(url) {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

async function mapLimit(items, limit, task) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await task(queue.shift());
  }));
}
