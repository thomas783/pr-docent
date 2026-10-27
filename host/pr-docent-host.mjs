// Local generator: Chrome starts this through native messaging when the panel asks for a tour.
// It writes the PR's diff and changed files to a temporary folder, runs the user's own Claude
// Code (their subscription, no API key) with the same prompt and checker as the GitHub Actions
// workflow, and sends the checked tour back. Installed by `pr-docent install` (bin/pr-docent.mjs).

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { checkTour, visibleLines } from "../src/diff.js";
import { parseTour } from "../src/tour.js";
import { createDecoder, encodeMessage, fillTemplate } from "./native.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = readConfig();
const TIMEOUT_MS = 15 * 60 * 1000;

let child = null;
const send = (message) => process.stdout.write(encodeMessage(message));

process.stdin.on(
  "data",
  createDecoder((message) => {
    if (message.type !== "generate") return;
    generate(message)
      .then((tour) => send({ type: "done", tour }))
      .catch((error) => send({ type: "error", message: error.message }))
      .finally(() => process.exit(0));
  }),
);
// Chrome closes stdin when the extension disconnects (panel closed, tab gone): stop Claude too.
process.stdin.on("end", () => {
  child?.kill();
  process.exit(0);
});

async function generate({ pr, title, body, headSha, diff, files, model, language }) {
  // Real path: on macOS the temp folder is a symlink, and the write rule must match exactly.
  const work = realpathSync(mkdtempSync(join(tmpdir(), "pr-docent-")));
  try {
    const repo = join(work, "repo");
    const out = join(work, "out");
    mkdirSync(repo);
    mkdirSync(out);
    for (const [path, content] of Object.entries(files)) {
      const target = resolve(repo, path);
      if (!target.startsWith(repo + sep)) continue; // never write outside the folder
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    writeFileSync(join(out, "pr.diff"), diff);
    writeFileSync(join(out, "pr.json"), JSON.stringify({ title, body, headRefOid: headSha }, null, 2));

    const prRef = `${pr.owner}/${pr.repo}#${pr.number}`;
    const prompt = fillTemplate(readFileSync(join(ROOT, "scripts", "tour-prompt.md"), "utf8"), {
      PR: prRef,
      OUT: out,
      TOOLS: ROOT,
      LANGUAGE: language || "한국어",
    });
    await runClaude(prompt, repo, [
      "--model", model || "claude-opus-5-5",
      "--permission-mode", "dontAsk",
      "--allowedTools", `Read,Glob,Grep,Edit(/${out}/tour.json),Bash(node ${ROOT}/scripts/check-tour.mjs:*)`,
    ]);

    let raw;
    try {
      raw = JSON.parse(readFileSync(join(out, "tour.json"), "utf8"));
    } catch {
      throw new Error("Claude did not write a tour file.");
    }
    const { tour, errors } = parseTour(raw);
    const problems = errors.length ? errors : checkTour(tour, visibleLines(diff));
    if (problems.length) throw new Error(`The tour did not pass the checks: ${problems.slice(0, 3).join(" / ")}`);
    return raw;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Written by the installer; without it, use whatever claude is on PATH. */
function readConfig() {
  try {
    return JSON.parse(readFileSync(join(homedir(), ".pr-docent", "config.json"), "utf8"));
  } catch {
    return { claude: "claude" };
  }
}

function runClaude(prompt, cwd, args) {
  return new Promise((resolvePromise, reject) => {
    const started = Date.now();
    let output = "";
    child = spawn(CONFIG.claude, ["-p", prompt, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const keep = (chunk) => (output = (output + chunk).slice(-2000));
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const progress = setInterval(() => send({ type: "progress", seconds: Math.round((Date.now() - started) / 1000) }), 5000);
    const timeout = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.on("error", (error) => reject(new Error(`Could not start Claude Code (${CONFIG.claude}): ${error.message}`)));
    child.on("close", (code) => {
      clearInterval(progress);
      clearTimeout(timeout);
      if (code === 0) resolvePromise();
      else reject(new Error(`Claude Code exited with code ${code}. ${output.trim().slice(-300)}`));
    });
  });
}
