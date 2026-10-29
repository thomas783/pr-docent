// Running the user's own Claude Code (their subscription) on a pull request in a temporary
// folder. Shared by tour generation and shorts.

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

const TIMEOUT_MS = 15 * 60 * 1000;
const CONFIG = readConfig();
let child = null;

/** Written by the installer; without it, use whatever claude is on PATH. */
function readConfig() {
  try {
    return JSON.parse(readFileSync(join(homedir(), ".pr-docent", "config.json"), "utf8"));
  } catch {
    return { claude: "claude" };
  }
}

/**
 * A temporary folder with the PR's changed files under repo/ and its diff and details under out/.
 * Real path: on macOS the temp folder is a symlink, and Claude's write rule must match exactly.
 */
export function prepareWorkspace({ files, diff, title, body, headSha }) {
  const work = realpathSync(mkdtempSync(join(tmpdir(), "pr-docent-")));
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
  return { work, repo, out };
}

/**
 * Why Claude Code failed, for the panel to say what to do: "claudeLoggedOut" when its output says
 * it isn't signed in (Claude Code 2.1: "Not logged in · Please run /login"), otherwise undefined.
 */
export function failureCode(output) {
  return /not logged in|please run \/login|invalid api key|oauth token has expired/i.test(output) ? "claudeLoggedOut" : undefined;
}

/** Runs `claude -p [prompt]` in [cwd]; reports elapsed seconds every 5s through [onProgress]. */
export function runClaude(prompt, cwd, args, onProgress = () => {}) {
  return new Promise((resolvePromise, reject) => {
    const started = Date.now();
    let output = "";
    // --strict-mcp-config without --mcp-config: none of the user's MCP servers start. A tour needs
    // none, and starting them is slow and can set off macOS prompts (e.g. a quarantined Python
    // module in an MCP server's uv cache).
    child = spawn(CONFIG.claude, ["-p", prompt, "--strict-mcp-config", ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const keep = (chunk) => (output = (output + chunk).slice(-2000));
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const progress = setInterval(() => onProgress(Math.round((Date.now() - started) / 1000)), 5000);
    const timeout = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.on("error", (error) =>
      reject(Object.assign(new Error(`Could not start Claude Code (${CONFIG.claude}): ${error.message}`), { code: "claudeMissing" })),
    );
    child.on("close", (code) => {
      clearInterval(progress);
      clearTimeout(timeout);
      child = null;
      if (code === 0) resolvePromise();
      else reject(Object.assign(new Error(`Claude Code exited with code ${code}. ${output.trim().slice(-300)}`), { code: failureCode(output) }));
    });
  });
}

/** Stops a running Claude Code, e.g. when the extension disconnects. */
export function stopClaude() {
  child?.kill();
}
