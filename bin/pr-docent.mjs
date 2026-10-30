#!/usr/bin/env node
// PR Docent's local generator setup.
//
//   npx pr-docent install [--user-data-dir <dir>]... [--extension-id <id>]...
//                                                     register with Chrome (once per computer)
//   npx pr-docent uninstall                           remove the registration and files
//   npx pr-docent short <owner/repo#n | PR URL>       make a short video of a PR (macOS, needs gh)
//
// Install copies the generator into ~/.pr-docent/app, so it keeps working after npx clears its
// cache, and writes a wrapper that pins PATH, Node and Claude Code: Chrome starts native hosts
// with a bare environment.

import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EXTENSION_IDS, HOST_NAME } from "../host/native.mjs";
import { browserDataDirs, runningUserDataDirs } from "./browsers.mjs";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// What the host needs at run time; everything else in the package is for the extension or tests.
const RUNTIME_FILES = [
  "host/claude.mjs", "host/native.mjs", "host/pr-docent-host.mjs", "host/render-short.mjs", "host/short.mjs",
  "src/diff.js", "src/guidelines.js", "src/short.js", "src/short-scenes.js", "src/tour.js",
  "scripts/check-short.mjs", "scripts/check-tour.mjs", "scripts/short-prompt.md", "scripts/tour-prompt.md",
];
const CONFIG_DIR = join(homedir(), ".pr-docent");

const [command = "help", ...args] = process.argv.slice(2);
const hostManifest = (dataDir) => join(dataDir, "NativeMessagingHosts", `${HOST_NAME}.json`);

if (command === "install") install(args);
else if (command === "uninstall") uninstall();
else if (command === "short") {
  const { shortCommand } = await import("../host/short-cli.mjs");
  await shortCommand(args).catch((error) => fail(error.message));
} else {
  console.log("usage: pr-docent install [--user-data-dir <dir>]... [--extension-id <id>]... | pr-docent uninstall | pr-docent short <owner/repo#number>");
  process.exit(command === "help" ? 0 : 2);
}

function install(args) {
  const defaults = browserDataDirs(homedir(), platform());
  if (!defaults.length) fail(`Not supported on ${platform()} yet (macOS and Linux only).`);
  let claude;
  try {
    claude = execFileSync("which", ["claude"], { encoding: "utf8" }).trim();
  } catch {
    fail("Claude Code (claude) was not found on PATH. Install it and log in first: https://claude.com/claude-code");
  }
  const signedIn = claudeSignedIn(claude);
  const option = (name) => args.flatMap((arg, i) => (arg === name && args[i + 1] ? [args[i + 1]] : []));
  const extraIds = option("--extension-id");
  // Google Chrome, other installed Chromium browsers, folders running browsers were started with
  // (automation tools pass --user-data-dir), and folders given with --user-data-dir.
  const dataDirs = [...new Set([
    defaults[0],
    ...defaults.slice(1).filter((dir) => existsSync(dir)),
    ...runningBrowserDataDirs(),
    ...option("--user-data-dir").map((dir) => resolve(dir.replace(/^~(?=$|\/)/, homedir()))),
  ])];
  const manifests = dataDirs.map(hostManifest);
  const extensionIds = [...new Set([...EXTENSION_IDS, ...extraIds])];

  const app = join(CONFIG_DIR, "app");
  rmSync(app, { recursive: true, force: true });
  for (const file of RUNTIME_FILES) {
    mkdirSync(dirname(join(app, file)), { recursive: true });
    cpSync(join(PACKAGE_ROOT, file), join(app, file));
  }
  writeFileSync(join(app, "package.json"), `${JSON.stringify({ type: "module" })}\n`); // src/*.js are ES modules
  // manifests: every registration, for uninstall.
  writeFileSync(join(CONFIG_DIR, "config.json"), `${JSON.stringify({ claude, manifests }, null, 2)}\n`);

  const quote = (value) => `'${value.replace(/'/g, `'\\''`)}'`;
  const wrapper = join(CONFIG_DIR, "host.sh");
  writeFileSync(wrapper, hostScript({ path: process.env.PATH, node: process.execPath, host: join(app, "host", "pr-docent-host.mjs"), quote }));
  chmodSync(wrapper, 0o755);

  const manifest = {
    name: HOST_NAME,
    description: "PR Docent local tour generator",
    path: wrapper,
    type: "stdio",
    allowed_origins: extensionIds.map((id) => `chrome-extension://${id}/`),
  };
  for (const path of manifests) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  console.log(`Installed the PR Docent local generator.
  Registered for:       ${dataDirs.join("\n                        ")}
  Generator:            ${app}
  Allowed extensions:   ${extensionIds.join(", ")}
  Claude Code:          ${claude}${signedIn ? "" : " (not signed in)"}
Reload the extension in chrome://extensions, then click "Create a tour with local Claude Code"
in the panel ("로컬 Claude Code로 투어 생성" in Korean).`);
  if (!signedIn) console.log("\nClaude Code isn't signed in yet, so tours can't be created. Run `claude` and sign in with /login.");
}

/**
 * Whether Claude Code is signed in, from `claude auth status` (JSON with loggedIn, exit 1 when
 * signed out). Versions without that command count as signed in: there's no telling.
 */
function claudeSignedIn(claude) {
  let output;
  try {
    output = execFileSync(claude, ["auth", "status", "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (error) {
    output = error.stdout;
  }
  try {
    return JSON.parse(output).loggedIn !== false;
  } catch {
    return true;
  }
}

/**
 * The script Chrome starts. It runs the Node that installed it, but version managers (nvm, fnm)
 * remove that Node when the user switches versions, so it then falls back to another one.
 */
function hostScript({ path, node, host, quote }) {
  return `#!/bin/sh
export PATH=${quote(path)}
NODE=${quote(node)}
if [ ! -x "$NODE" ]; then
  for candidate in "$HOME"/.nvm/versions/node/*/bin/node "$HOME"/.local/share/fnm/node-versions/*/installation/bin/node \\
    "$HOME"/Library/Application\\ Support/fnm/node-versions/*/installation/bin/node "$HOME"/.volta/bin/node \\
    /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
    if [ -x "$candidate" ]; then NODE="$candidate"; fi
  done
fi
if [ ! -x "$NODE" ]; then NODE=$(command -v node); fi
# Chrome shows none of the helper's errors; keep them for troubleshooting, emptied past 100 KB.
LOG="$HOME/.pr-docent/host.log"
if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 100000 ]; then : > "$LOG"; fi
exec "$NODE" ${quote(host)} 2>>"$LOG"
`;
}

/** --user-data-dir folders of running browsers; none when ps isn't available. */
function runningBrowserDataDirs() {
  try {
    return runningUserDataDirs(execFileSync("ps", ["-axo", "command="], { encoding: "utf8" }), platform());
  } catch {
    return [];
  }
}

function uninstall() {
  let manifests = browserDataDirs(homedir(), platform()).map(hostManifest);
  try {
    manifests = [...new Set([...manifests, ...JSON.parse(readFileSync(join(CONFIG_DIR, "config.json"), "utf8")).manifests])];
  } catch {
    // installed by an older version: only the default folders
  }
  const removed = manifests.filter((path) => existsSync(path));
  for (const path of removed) rmSync(path, { force: true });
  rmSync(CONFIG_DIR, { recursive: true, force: true });
  console.log(`Removed ${[CONFIG_DIR, ...removed].join(", ")}.`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
