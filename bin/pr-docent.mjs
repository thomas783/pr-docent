#!/usr/bin/env node
// PR Docent's local generator setup.
//
//   npx pr-docent install [--extension-id <id>]...   register with Chrome (once per computer)
//   npx pr-docent uninstall                           remove the registration and files
//
// Install copies the generator into ~/.pr-docent/app, so it keeps working after npx clears its
// cache, and writes a wrapper that pins PATH, Node and Claude Code: Chrome starts native hosts
// with a bare environment.

import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EXTENSION_IDS, HOST_NAME } from "../host/native.mjs";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// What the host needs at run time; everything else in the package is for the extension or tests.
const RUNTIME_FILES = ["host/native.mjs", "host/pr-docent-host.mjs", "src/diff.js", "src/guidelines.js", "src/tour.js", "scripts/check-tour.mjs", "scripts/tour-prompt.md"];
const HOSTS_DIRS = {
  darwin: join(homedir(), "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts"),
  linux: join(homedir(), ".config", "google-chrome", "NativeMessagingHosts"),
};
const CONFIG_DIR = join(homedir(), ".pr-docent");

const [command = "help", ...args] = process.argv.slice(2);
const hostsDir = HOSTS_DIRS[platform()];
const hostManifest = hostsDir && join(hostsDir, `${HOST_NAME}.json`);

if (command === "install") install(args);
else if (command === "uninstall") uninstall();
else {
  console.log("usage: pr-docent install [--extension-id <id>]... | pr-docent uninstall");
  process.exit(command === "help" ? 0 : 2);
}

function install(args) {
  if (!hostsDir) fail(`Not supported on ${platform()} yet (macOS and Linux only).`);
  let claude;
  try {
    claude = execFileSync("which", ["claude"], { encoding: "utf8" }).trim();
  } catch {
    fail("Claude Code (claude) was not found on PATH. Install it and log in first: https://claude.com/claude-code");
  }
  const extraIds = args.flatMap((arg, i) => (arg === "--extension-id" && args[i + 1] ? [args[i + 1]] : []));
  const extensionIds = [...new Set([...EXTENSION_IDS, ...extraIds])];

  const app = join(CONFIG_DIR, "app");
  rmSync(app, { recursive: true, force: true });
  for (const file of RUNTIME_FILES) {
    mkdirSync(dirname(join(app, file)), { recursive: true });
    cpSync(join(PACKAGE_ROOT, file), join(app, file));
  }
  writeFileSync(join(app, "package.json"), `${JSON.stringify({ type: "module" })}\n`); // src/*.js are ES modules
  writeFileSync(join(CONFIG_DIR, "config.json"), `${JSON.stringify({ claude }, null, 2)}\n`);

  const quote = (value) => `'${value.replace(/'/g, `'\\''`)}'`;
  const wrapper = join(CONFIG_DIR, "host.sh");
  writeFileSync(wrapper, `#!/bin/sh\nexport PATH=${quote(process.env.PATH)}\nexec ${quote(process.execPath)} ${quote(join(app, "host", "pr-docent-host.mjs"))}\n`);
  chmodSync(wrapper, 0o755);

  mkdirSync(hostsDir, { recursive: true });
  const manifest = {
    name: HOST_NAME,
    description: "PR Docent local tour generator",
    path: wrapper,
    type: "stdio",
    allowed_origins: extensionIds.map((id) => `chrome-extension://${id}/`),
  };
  writeFileSync(hostManifest, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Installed the PR Docent local generator.
  Chrome host manifest: ${hostManifest}
  Generator:            ${app}
  Allowed extensions:   ${extensionIds.join(", ")}
  Claude Code:          ${claude}
Reload the extension in chrome://extensions, then click "Create a tour with local Claude Code"
in the panel ("로컬 Claude Code로 투어 생성" in Korean).`);
}

function uninstall() {
  rmSync(CONFIG_DIR, { recursive: true, force: true });
  if (hostManifest) rmSync(hostManifest, { force: true });
  console.log(`Removed ${CONFIG_DIR}${hostManifest ? ` and ${hostManifest}` : ""}.`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
