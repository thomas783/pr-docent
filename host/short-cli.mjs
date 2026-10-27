// `pr-docent short <PR>`: makes a short from the terminal with gh instead of the extension.
// Uses the tour posted in the PR's comments (or --tour <file>).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { visibleLines } from "../src/diff.js";
import { findTourInBlocks, parseTour, tourLanguage } from "../src/tour.js";
import { generateShort } from "./short.mjs";

const gh = (...args) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 100e6 });

/** "owner/repo#12" or a pull request URL → { owner, repo, number }, or null. */
export function parsePullRequestRef(text) {
  const match = String(text).match(/^(?:https:\/\/github\.com\/)?([^/\s#]+)\/([^/\s#]+)(?:#|\/pull\/)(\d+)/);
  return match ? { owner: match[1], repo: match[2], number: Number(match[3]) } : null;
}

export async function shortCommand(args) {
  const pr = parsePullRequestRef(args[0] ?? "");
  if (!pr) throw new Error("usage: pr-docent short <owner/repo#number | pull request URL> [--tour <file>] [--out <file.mp4>]");
  const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const repoArg = `${pr.owner}/${pr.repo}`;

  const details = JSON.parse(gh("pr", "view", String(pr.number), "-R", repoArg, "--json", "title,body,headRefOid,comments"));
  let tour;
  if (option("--tour")) {
    tour = JSON.parse(readFileSync(option("--tour"), "utf8"));
  } else {
    const blocks = details.comments.flatMap((c) => [...c.body.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => m[1]));
    tour = findTourInBlocks(blocks, pr);
    if (!tour) throw new Error("This PR has no tour comment. Generate a tour first, or pass --tour <file>.");
  }
  const parsed = parseTour(tour);
  if (parsed.errors.length) throw new Error(`The tour is invalid: ${parsed.errors[0]}`);

  console.log(`Fetching ${repoArg}#${pr.number}…`);
  const diff = gh("pr", "diff", String(pr.number), "-R", repoArg);
  const files = {};
  for (const path of visibleLines(diff).keys()) {
    try {
      files[path] = gh("api", `repos/${repoArg}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${details.headRefOid}`, "-H", "Accept: application/vnd.github.raw");
    } catch {
      // deleted or binary at the head commit
    }
  }
  const path = await generateShort({
    pr, tour, title: details.title, body: details.body, headSha: details.headRefOid, diff, files,
    language: tourLanguage(parsed.tour) === "ko" ? "한국어" : "English",
    outPath: option("--out"),
    onProgress: ({ stage, seconds, detail }) => {
      if (stage === "script" && seconds % 15 === 0) console.log(`Claude Code is writing the script… ${seconds}s`);
      if (stage === "render") console.log(`Rendering ${detail}`);
    },
  });
  console.log(`Saved ${path}`);
}
