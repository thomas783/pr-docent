// Local generator: Chrome starts this through native messaging when the panel asks for a tour,
// a short script, or a video file. Tours: Claude Code (the user's own subscription, no API key)
// writes one with the same prompt and checker as the GitHub Actions workflow. Shorts: see
// short.mjs. Installed by `pr-docent install` (bin/pr-docent.mjs).

import { execFile } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { changedLineCount, checkTour, visibleLines } from "../src/diff.js";
import { buildPrompt, checkBrevity, parseGuidelines } from "../src/guidelines.js";
import { parseTour } from "../src/tour.js";
import { prepareWorkspace, runClaude, stopClaude } from "./claude.mjs";
import { createDecoder, encodeMessage } from "./native.mjs";
import { stopRendering } from "./render-short.mjs";
import { saveShortVideo, writeShortScript } from "./short.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const send = (message) => process.stdout.write(encodeMessage(message));
// Writing after Chrome closed the pipe fails; there is no one left to tell.
process.stdout.on("error", () => process.exit(0));
let busy = false;

process.stdin.on(
  "data",
  createDecoder((message) => {
    busy = true;
    const reply = (promise, toMessage) =>
      promise
        .then((value) => send(toMessage(value)))
        .catch((error) => send({ type: "error", message: error.message }))
        // Exit once stdout has flushed: on macOS pipe writes are asynchronous.
        .finally(() => process.stdout.write("", () => process.exit(0)));
    if (message.type === "generate") {
      reply(generate(message), (tour) => ({ type: "done", tour }));
    } else if (message.type === "script") {
      const onProgress = (progress) => send({ type: "progress", ...progress });
      reply(writeShortScript({ ...message, onProgress }), (short) => ({ type: "done", short }));
    } else if (message.type === "render") {
      const onProgress = (progress) => send({ type: "progress", ...progress });
      reply(saveShortVideo({ short: message.short, onProgress }), (path) => ({ type: "done", path }));
    } else if (message.type === "reveal") {
      reply(reveal(message.path), () => ({ type: "done" }));
    }
  }),
);
// Chrome closes stdin when the extension disconnects (panel closed, tab gone): stop Claude or the
// render too, and let the request finish failing so its temporary folder is removed, then exit
// (from the reply above, or after a grace period).
process.stdin.on("end", () => {
  stopClaude();
  stopRendering();
  if (!busy) process.exit(0);
  setTimeout(() => process.exit(0), 5000);
});

/** Shows a saved video in Finder; only files this tool writes (pr-docent-*.mp4). */
function reveal(path) {
  if (!/\/pr-docent-[^/]+\.mp4$/.test(String(path)) || !existsSync(path)) return Promise.reject(new Error("Not a PR Docent video"));
  return new Promise((done) => execFile("open", ["-R", path], () => done()));
}

async function generate({ pr, title, body, headSha, diff, files, guidelines = "", model, language }) {
  const { work, repo, out } = prepareWorkspace({ files, diff, title, body, headSha });
  try {
    if (guidelines) writeFileSync(join(out, "guidelines.md"), guidelines);
    const { limits, errors: guidelineErrors } = parseGuidelines(guidelines);
    if (guidelineErrors.length) throw new Error(`.github/pr-docent.md: ${guidelineErrors.join(" / ")}`);
    const changedLines = changedLineCount(diff);

    const prRef = `${pr.owner}/${pr.repo}#${pr.number}`;
    const prompt = buildPrompt(readFileSync(join(ROOT, "scripts", "tour-prompt.md"), "utf8"), {
      pr: prRef,
      out,
      tools: ROOT,
      language: language || "한국어",
      changedLines,
      guidelinesText: guidelines,
    });
    await runClaude(prompt, repo, [
      "--model", model || "claude-opus-5-5",
      "--permission-mode", "dontAsk",
      "--allowedTools", `Read,Glob,Grep,Edit(/${out}/tour.json),Bash(node ${ROOT}/scripts/check-tour.mjs:*)`,
    ], (seconds) => send({ type: "progress", seconds }));

    let raw;
    try {
      raw = JSON.parse(readFileSync(join(out, "tour.json"), "utf8"));
    } catch {
      throw new Error("Claude did not write a tour file.");
    }
    const { tour, errors } = parseTour(raw);
    const problems = errors.length
      ? errors
      : [...checkTour(tour, visibleLines(diff)), ...checkBrevity(tour, { changedLines, limits })];
    if (problems.length) throw new Error(`The tour did not pass the checks: ${problems.slice(0, 3).join(" / ")}`);
    return raw;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
