#!/usr/bin/env node
// Validates a tour against a pull request diff.
//
//   node scripts/check-tour.mjs <tour.json> <pr.diff> [owner/repo#number]
//
// Prints every problem and exits 1, or prints a one-line summary and exits 0.
// The diff must use 3 lines of context (`gh pr diff` or `git diff -U3`), as GitHub does.

import { readFileSync } from "node:fs";
import { checkTour, visibleLines } from "../src/diff.js";
import { flattenSteps, parseTour } from "../src/tour.js";

const [tourPath, diffPath, expectedPr] = process.argv.slice(2);
if (!tourPath || !diffPath) {
  console.error("usage: node scripts/check-tour.mjs <tour.json> <pr.diff> [owner/repo#number]");
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

const problems = checkTour(tour, visibleLines(readFileSync(diffPath, "utf8")));
if (problems.length) fail(problems);

console.log(`OK: ${tour.chapters.length} chapters, ${flattenSteps(tour).length} steps, ${tour.skipped.length} skipped files`);
