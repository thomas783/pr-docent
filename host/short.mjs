// Shorts on this computer: Claude Code writes the script from the PR's tour (the panel plays it
// live), and render-short.mjs turns a script into an MP4 when someone wants a file. Used by the
// native host and by `pr-docent short` on the command line.

import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkShort, parseShort } from "../src/short.js";
import { prepareWorkspace, runClaude } from "./claude.mjs";
import { renderShort } from "./render-short.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Has Claude Code write and check a short script from the PR's tour; returns the raw JSON. */
export async function writeShortScript({ pr, tour, title, body, headSha, diff, files, language, model, onProgress = () => {} }) {
  const { work, repo, out } = prepareWorkspace({ files, diff, title, body, headSha });
  try {
    writeFileSync(join(out, "tour.json"), JSON.stringify(tour, null, 2));
    const prRef = `${pr.owner}/${pr.repo}#${pr.number}`;
    const prompt = readFileSync(join(ROOT, "scripts", "short-prompt.md"), "utf8").replace(/{{(\w+)}}/g, (match, name) =>
      ({ PR: prRef, OUT: out, TOOLS: ROOT, LANGUAGE: language || "한국어" })[name] ?? match);
    onProgress({ stage: "script", seconds: 0 });
    await runClaude(prompt, repo, [
      "--model", model || "claude-opus-5-5",
      "--permission-mode", "dontAsk",
      "--allowedTools", `Read,Glob,Grep,Edit(/${out}/short.json),Bash(node ${ROOT}/scripts/check-short.mjs:*)`,
    ], (seconds) => onProgress({ stage: "script", seconds }));

    let raw;
    try {
      raw = JSON.parse(readFileSync(join(out, "short.json"), "utf8"));
    } catch {
      throw new Error("Claude did not write a short script.");
    }
    const { short, errors } = parseShort(raw);
    const problems = errors.length ? errors : checkShort(short);
    if (problems.length) throw new Error(`The short did not pass the checks: ${problems.slice(0, 3).join(" / ")}`);
    return raw;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Renders a checked short script to an MP4 (Downloads unless [outPath]); returns its path. */
export async function saveShortVideo({ short: raw, outPath, onProgress = () => {} }) {
  const { short, errors } = parseShort(raw);
  if (!short) throw new Error(`Invalid short: ${errors[0]}`);
  const { pr } = short;
  const work = realpathSync(mkdtempSync(join(tmpdir(), "pr-docent-render-")));
  try {
    const target = outPath ?? freePath(join(homedir(), "Downloads"), `pr-docent-${pr.owner}-${pr.repo}-${pr.number}`);
    return await renderShort({ short, outPath: target, workDir: work, onProgress: (detail) => onProgress({ stage: "render", detail }) });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** The script and then the video: what `pr-docent short` does. */
export async function generateShort(options) {
  const short = await writeShortScript(options);
  return saveShortVideo({ short, outPath: options.outPath, onProgress: options.onProgress });
}

/** dir/name.mp4, or dir/name-2.mp4 and so on when that exists. */
function freePath(dir, name) {
  for (let i = 1; ; i++) {
    const path = join(dir, `${name}${i === 1 ? "" : `-${i}`}.mp4`);
    if (!existsSync(path)) return path;
  }
}
