#!/usr/bin/env node
// Registers the local generator with Chrome so the panel's "generate locally" button can run
// the user's Claude Code. Run once per computer from this repository: npm run install-host
//
// Chrome starts native hosts with a bare environment, so the wrapper script pins the PATH,
// the Node binary and the Claude Code binary found now.

import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HOST_NAME, extensionIdFromKey } from "../host/native.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOSTS_DIRS = {
  darwin: join(homedir(), "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts"),
  linux: join(homedir(), ".config", "google-chrome", "NativeMessagingHosts"),
};

const hostsDir = HOSTS_DIRS[platform()];
if (!hostsDir) {
  console.error(`Not supported on ${platform()} yet (macOS and Linux only).`);
  process.exit(1);
}

let claude;
try {
  claude = execFileSync("which", ["claude"], { encoding: "utf8" }).trim();
} catch {
  console.error("Claude Code (claude) was not found on PATH. Install it and log in first: https://claude.com/claude-code");
  process.exit(1);
}

const { key } = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const extensionId = extensionIdFromKey(key);
const configDir = join(homedir(), ".pr-docent");
const wrapper = join(configDir, "host.sh");
const quote = (value) => `'${value.replace(/'/g, `'\\''`)}'`;

mkdirSync(configDir, { recursive: true });
writeFileSync(join(configDir, "config.json"), `${JSON.stringify({ claude }, null, 2)}\n`);
writeFileSync(
  wrapper,
  `#!/bin/sh\nexport PATH=${quote(process.env.PATH)}\nexec ${quote(process.execPath)} ${quote(join(ROOT, "host", "pr-docent-host.mjs"))}\n`,
);
chmodSync(wrapper, 0o755);

mkdirSync(hostsDir, { recursive: true });
const manifestPath = join(hostsDir, `${HOST_NAME}.json`);
writeFileSync(
  manifestPath,
  `${JSON.stringify(
    {
      name: HOST_NAME,
      description: "PR Docent local tour generator",
      path: wrapper,
      type: "stdio",
      allowed_origins: [`chrome-extension://${extensionId}/`],
    },
    null,
    2,
  )}\n`,
);

console.log(`Installed the PR Docent local generator.
  Chrome host manifest: ${manifestPath}
  Allowed extension:    ${extensionId}
  Claude Code:          ${claude}
Reload the extension in chrome://extensions, then use "로컬 Claude Code로 투어 생성" in the panel.`);
