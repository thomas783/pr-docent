#!/usr/bin/env node
// Validates a tour against a pull request diff.
//
//   node scripts/check-tour.mjs <tour.json> <pr.diff> [owner/repo#number] [--guidelines <file>]
//
// Prints every problem and exits 1, or prints a one-line summary and exits 0.
// The diff must use 3 lines of context (`gh pr diff` or `git diff -U3`), as GitHub does.
// --guidelines points at a copy of the repository's .github/pr-docent.md; a missing file means
// the default limits.

import { existsSync, readFileSync } from "node:fs";
import { changedLineCount, checkTour, visibleLines } from "../src/diff.js";
import { checkBrevity, parseGuidelines } from "../src/guidelines.js";
import { flattenSteps, parseTour } from "../src/tour.js";

const args = process.argv.slice(2);
const flag = args.indexOf("--guidelines");
const guidelinesPath = flag >= 0 ? args.splice(flag, 2)[1] : null;
const [tourPath, diffPath, expectedPr] = args;
if (!tourPath || !diffPath) {
  console.error("usage: node scripts/check-tour.mjs <tour.json> <pr.diff> [owner/repo#number] [--guidelines <file>]");
  process.exit(2);
}

const fail = (errors) => {
  console.error(`Tour has ${errors.length} problem(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
};

let raw;
try {
  raw = JSON.parse(readFileSync(tourPath, "utf8"));
} catch (error) {
  fail([`${tourPath} is not valid JSON: ${error.message}`]);
}

const { tour, errors } = parseTour(raw);
if (errors.length) fail(errors);

if (expectedPr) {
  const actual = `${tour.pr.owner}/${tour.pr.repo}#${tour.pr.number}`;
  if (actual !== expectedPr) fail([`pr is ${actual}, expected ${expectedPr}`]);
}

const diff = readFileSync(diffPath, "utf8");
const guidelines = parseGuidelines(guidelinesPath && existsSync(guidelinesPath) ? readFileSync(guidelinesPath, "utf8") : "");
if (guidelines.errors.length) fail(guidelines.errors.map((error) => `.github/pr-docent.md: ${error}`));
const problems = [
  ...checkTour(tour, visibleLines(diff)),
  ...checkBrevity(tour, { changedLines: changedLineCount(diff), limits: guidelines.limits }),
];
if (problems.length) fail(problems);

console.log(`OK: ${tour.chapters.length} chapters, ${flattenSteps(tour).length} steps, ${tour.skipped.length} skipped files`);
