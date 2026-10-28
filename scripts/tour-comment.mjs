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
import { flattenSteps, parseTour, tourLanguage } from "../src/tour.js";

export const MARKER = "<!-- pr-docent:tour -->";
const MAX_COMMENT_LENGTH = 65000; // GitHub rejects comment bodies over 65536 characters

// The comment's own words, in the tour's language.
const TEXT = {
  en: {
    heading: (title) => `## 🎧 PR Docent review tour: ${title}`,
    madeFor: (sha) => `Made for commit \`${sha}\`.`,
    howTo: (chapters, steps) => `Click **PR Docent** on the Files changed tab to play this tour (${chapters} chapters, ${steps} steps).`,
    chapters: "### Chapters",
    stepCount: (n) => `(${n} ${n === 1 ? "step" : "steps"})`,
    points: "### Review points",
    skipped: "Skipped files",
    short: (title) => `### 🎬 Short: ${title}`,
    shortHowTo: "Play it with the video button in the PR Docent panel on the Files changed tab.",
    tourJson: "Tour JSON (read by the PR Docent extension)",
    shortJson: "Short script JSON (read by the PR Docent extension)",
  },
  ko: {
    heading: (title) => `## 🎧 PR Docent 리뷰 투어: ${title}`,
    madeFor: (sha) => `커밋 \`${sha}\` 기준으로 만든 투어입니다.`,
    howTo: (chapters, steps) => `Files changed 탭에서 **PR Docent**를 누르면 이 투어가 재생됩니다. (${chapters}개 챕터, ${steps}단계)`,
    chapters: "### 챕터",
    stepCount: (n) => `(${n}단계)`,
    points: "### 리뷰 포인트",
    skipped: "건너뛴 파일",
    short: (title) => `### 🎬 쇼츠: ${title}`,
    shortHowTo: "Files changed 탭의 PR Docent 패널에서 영상 버튼을 누르면 재생됩니다.",
    tourJson: "투어 JSON (PR Docent 확장이 읽습니다)",
    shortJson: "쇼츠 대본 JSON (PR Docent 확장이 읽습니다)",
  },
};

/** The comment for a tour and, when there is one, the short made from it. */
export function renderComment(raw, shortRaw = null) {
  const { tour, errors } = parseTour(raw);
  if (errors.length) throw new Error(`Invalid tour: ${errors.join("; ")}`);
  const steps = flattenSteps(tour);
  const t = TEXT[tourLanguage(tour)];
  const lines = [
    MARKER,
    t.heading(tour.title),
    "",
    tour.summary,
    "",
    ...(tour.pr.head ? [t.madeFor(tour.pr.head.slice(0, 7)), ""] : []),
    t.howTo(tour.chapters.length, steps.length),
    "",
    t.chapters,
    ...tour.chapters.map((c) => `- ${[`**${c.title}**`, c.summary, t.stepCount(c.steps.length)].filter(Boolean).join(" ")}`),
  ];
  const points = steps.filter((s) => s.point);
  if (points.length) {
    lines.push("", t.points);
    for (const s of points) lines.push(`- \`${s.file}${s.lines ? `:${s.lines[0]}-${s.lines[1]}` : ""}\` ${s.point}`);
  }
  if (tour.skipped.length) {
    lines.push("", `<details><summary>${t.skipped}</summary>`, "");
    for (const s of tour.skipped) lines.push(`- \`${s.file}\` ${s.reason}`);
    lines.push("", "</details>");
  }
  const short = shortRaw && parseShort(shortRaw).short;
  if (short) {
    lines.push("", t.short(short.title), "", short.hook, "", t.shortHowTo);
    for (const scene of short.scenes) lines.push(`- **${scene.headline}** ${scene.narration}`);
  }
  // A ``` inside a note would end the code block early; \u0060 is the same backtick to JSON.
  const block = (value) => ["```json", JSON.stringify(value).replace(/`/g, "\\u0060"), "```"];
  lines.push("", `<details><summary>${t.tourJson}</summary>`, "", ...block(raw), "", "</details>", "");
  if (short) lines.push(`<details><summary>${t.shortJson}</summary>`, "", ...block(shortRaw), "", "</details>", "");
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
