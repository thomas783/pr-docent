#!/usr/bin/env node
// Renders a tour as the PR comment the generate-tour workflow posts.
//
//   node scripts/tour-comment.mjs <tour.json> [short.json] > comment.md
//
// People read the summary; the PR Docent extension reads the JSON block in the folded section.
// The first line marks the comment so the workflow updates it instead of posting a new one.

import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseShort } from "../src/short.js";
import { flattenSteps, parseTour } from "../src/tour.js";

export const MARKER = "<!-- pr-docent:tour -->";
const MAX_COMMENT_LENGTH = 65000; // GitHub rejects comment bodies over 65536 characters

/** The comment for a tour and, when there is one, the short made from it. */
export function renderComment(raw, shortRaw = null) {
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
  const short = shortRaw && parseShort(shortRaw).short;
  if (short) {
    lines.push("", `### 🎬 쇼츠: ${short.title}`, "", short.hook, "", "Files changed 탭의 PR Docent 패널에서 **🎬 쇼츠 보기**로 재생됩니다.");
    for (const scene of short.scenes) lines.push(`- **${scene.headline}** ${scene.narration}`);
  }
  // A ``` inside a note would end the code block early; \u0060 is the same backtick to JSON.
  const block = (value) => ["```json", JSON.stringify(value).replace(/`/g, "\\u0060"), "```"];
  lines.push("", "<details><summary>투어 JSON (PR Docent 확장이 읽습니다)</summary>", "", ...block(raw), "", "</details>", "");
  if (short) lines.push("<details><summary>쇼츠 대본 JSON (PR Docent 확장이 읽습니다)</summary>", "", ...block(shortRaw), "", "</details>", "");
  const body = lines.join("\n");
  if (body.length > MAX_COMMENT_LENGTH) throw new Error(`Comment is ${body.length} characters; GitHub allows ${MAX_COMMENT_LENGTH}`);
  return body;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [tourPath, shortPath] = process.argv.slice(2);
  if (!tourPath) {
    console.error("usage: node scripts/tour-comment.mjs <tour.json> [short.json]");
    process.exit(2);
  }
  const read = (path) => JSON.parse(readFileSync(path, "utf8"));
  process.stdout.write(renderComment(read(tourPath), shortPath && existsSync(shortPath) ? read(shortPath) : null));
}
