#!/usr/bin/env node
// Prints the generator's instructions for the GitHub Actions workflow (the local host calls
// buildPrompt directly).
//
//   node scripts/build-prompt.mjs <owner/repo#number> <out dir> <tools dir> <language>
//
// Reads <out>/pr.diff and, when present, <out>/guidelines.md (the repository's .github/pr-docent.md).

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { changedLineCount } from "../src/diff.js";
import { buildPrompt } from "../src/guidelines.js";

const [pr, out, tools, language] = process.argv.slice(2);
const guidelinesPath = join(out, "guidelines.md");
const template = readFileSync(join(resolve(dirname(fileURLToPath(import.meta.url))), "tour-prompt.md"), "utf8");
process.stdout.write(
  buildPrompt(template, {
    pr,
    out,
    tools,
    language,
    changedLines: changedLineCount(readFileSync(join(out, "pr.diff"), "utf8")),
    guidelinesText: existsSync(guidelinesPath) ? readFileSync(guidelinesPath, "utf8") : "",
  }),
);
