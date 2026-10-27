#!/usr/bin/env node
// Validates a short (video script).
//
//   node scripts/check-short.mjs <short.json> [owner/repo#number]
//
// Prints every problem and exits 1, or prints a one-line summary and exits 0.

import { readFileSync } from "node:fs";
import { checkShort, parseShort } from "../src/short.js";

const [shortPath, expectedPr] = process.argv.slice(2);
if (!shortPath) {
  console.error("usage: node scripts/check-short.mjs <short.json> [owner/repo#number]");
  process.exit(2);
}

const fail = (errors) => {
  console.error(`Short has ${errors.length} problem(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
};

let raw;
try {
  raw = JSON.parse(readFileSync(shortPath, "utf8"));
} catch (error) {
  fail([`${shortPath} is not valid JSON: ${error.message}`]);
}
const { short, errors } = parseShort(raw);
if (errors.length) fail(errors);
if (expectedPr) {
  const actual = `${short.pr.owner}/${short.pr.repo}#${short.pr.number}`;
  if (actual !== expectedPr) fail([`pr is ${actual}, expected ${expectedPr}`]);
}
const problems = checkShort(short);
if (problems.length) fail(problems);
console.log(`OK: ${short.scenes.length + 2} scenes`);
