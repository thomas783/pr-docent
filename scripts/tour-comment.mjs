#!/usr/bin/env node
// Renders a tour as the PR comment the generate-tour workflow posts.
//
//   node scripts/tour-comment.mjs <tour.json> > comment.md
//
// People read the summary; the PR Docent extension reads the JSON block in the folded section.
// The first line marks the comment so the workflow updates it instead of posting a new one.

import { readFileSync } from "node:fs";
import { flattenSteps, parseTour } from "../src/tour.js";

export const MARKER = "<!-- pr-docent:tour -->";
const MAX_COMMENT_LENGTH = 65000; // GitHub rejects comment bodies over 65536 characters

export function renderComment(raw) {
  const { tour, errors } = parseTour(raw);
  if (errors.length) throw new Error(`Invalid tour: ${errors.join("; ")}`);
  const steps = flattenSteps(tour);
  const lines = [
    MARKER,
    `## 🎧 PR Docent 리뷰 투어: ${tour.title}`,
    "",
    tour.summary,
    "",
    `Files changed 탭에서 **▶ PR Docent**를 누르면 이 투어가 재생됩니다. (${tour.chapters.length}개 챕터, ${steps.length}단계)`,
    "",
    "### 챕터",
    ...tour.chapters.map((c) => `- **${c.title}** ${c.summary} (${c.steps.length}단계)`),
  ];
  const points = steps.filter((s) => s.point);
  if (points.length) {
    lines.push("", "### 리뷰 포인트");
    for (const s of points) lines.push(`- \`${s.file}${s.lines ? `:${s.lines[0]}-${s.lines[1]}` : ""}\` ${s.point}`);
  }
  if (tour.skipped.length) {
    lines.push("", "<details><summary>건너뛴 파일</summary>", "");
    for (const s of tour.skipped) lines.push(`- \`${s.file}\` ${s.reason}`);
    lines.push("", "</details>");
  }
  // A ``` inside a note would end the code block early; ` is the same backtick to JSON.
  const json = JSON.stringify(raw).replace(/`/g, "\\u0060");
  lines.push("", "<details><summary>투어 JSON (PR Docent 확장이 읽습니다)</summary>", "", "```json", json, "```", "", "</details>", "");
  const body = lines.join("\n");
  if (body.length > MAX_COMMENT_LENGTH) throw new Error(`Comment is ${body.length} characters; GitHub allows ${MAX_COMMENT_LENGTH}`);
  return body;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [tourPath] = process.argv.slice(2);
  if (!tourPath) {
    console.error("usage: node scripts/tour-comment.mjs <tour.json>");
    process.exit(2);
  }
  process.stdout.write(renderComment(JSON.parse(readFileSync(tourPath, "utf8"))));
}
