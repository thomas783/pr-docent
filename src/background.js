// Service worker: generates a tour with the user's local Claude Code. The panel connects with
// the PR and its head commit; this fetches the diff and the changed files (host permissions
// get past the cross-origin redirects GitHub uses for .diff and raw files, and the viewer's
// session covers private repositories), then hands them to the native host.

import { visibleLines } from "./diff.js";

const HOST_NAME = "dev.prdocent.host";
const MAX_FILE_BYTES = 1_000_000;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "generate") return;
  port.onMessage.addListener((request) =>
    generate(port, request).catch((error) => port.postMessage({ type: "error", message: error.message })),
  );
});

async function generate(port, { pr, title, body, headSha, language }) {
  const base = `https://github.com/${pr.owner}/${pr.repo}`;
  port.postMessage({ type: "progress", stage: "fetch" });
  const diff = await fetchText(`${base}/pull/${pr.number}.diff`);
  const files = {};
  await mapLimit([...visibleLines(diff).keys()], 6, async (path) => {
    // Deleted and binary files have no useful text at the head commit.
    const text = await fetchText(`${base}/raw/${headSha}/${path.split("/").map(encodeURIComponent).join("/")}`).catch(() => null);
    if (text !== null && text.length <= MAX_FILE_BYTES && !text.includes("\u0000")) files[path] = text;
  });

  port.postMessage({ type: "progress", stage: "claude", seconds: 0 });
  const host = chrome.runtime.connectNative(HOST_NAME);
  host.onMessage.addListener((message) => port.postMessage(message));
  host.onDisconnect.addListener(() => {
    const error = chrome.runtime.lastError?.message;
    if (error) port.postMessage({ type: "error", message: error, notInstalled: /not found/i.test(error) });
  });
  port.onDisconnect.addListener(() => host.disconnect());
  host.postMessage({ type: "generate", pr, title, body, headSha, diff, files, language });
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
