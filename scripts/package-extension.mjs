#!/usr/bin/env node
// Builds the zip to upload to the Chrome Web Store: dist/pr-docent-<version>.zip.
//
//   npm run package
//
// Only what the extension runs is included. The manifest loses its "key" (the store refuses it
// and assigns its own extension ID), and tours/ keeps only the public examples git tracks: the
// folder may also hold tours of private pull requests, which must never be published.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const name = `pr-docent-${manifest.version}`;
const dist = join(root, "dist");
const out = join(dist, name);
const zip = join(dist, `${name}.zip`);

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
const tracked = (dir) => git("ls-files", "--", dir);
const files = [
  ...["_locales", "src", "icons"].flatMap(tracked),
  ...git("ls-files", "--", "tours/*.json"),
  "popup.html",
  "player.html",
  "LICENSE",
];

rmSync(out, { recursive: true, force: true });
rmSync(zip, { force: true });
for (const file of files) {
  mkdirSync(dirname(join(out, file)), { recursive: true });
  cpSync(join(root, file), join(out, file));
}
const { key, ...storeManifest } = manifest;
writeFileSync(join(out, "manifest.json"), `${JSON.stringify(storeManifest, null, 2)}\n`);

// Every file the manifest points at has to be in the package.
const referenced = [
  ...Object.values(storeManifest.icons ?? {}),
  ...Object.values(storeManifest.action?.default_icon ?? {}),
  storeManifest.action?.default_popup,
  storeManifest.background?.service_worker,
  ...(storeManifest.content_scripts ?? []).flatMap((script) => script.js ?? []),
].filter(Boolean);
const missing = referenced.filter((file) => !existsSync(join(out, file)));
if (missing.length) {
  console.error(`Missing from the package: ${missing.join(", ")}`);
  process.exit(1);
}

execFileSync("zip", ["-qr", zip, "."], { cwd: out });
console.log(`${zip} (${files.length + 1} files)`);
