import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderComment } from "../scripts/tour-comment.mjs";
import { findTourInBlocks } from "../src/tour.js";

const tour = (title, note) => ({
  version: 1,
  pr: { owner: "o", repo: "r", number: 3, head: "a".repeat(40) },
  title,
  summary: "s",
  chapters: [{ title: "1", steps: [{ file: "a.js", note }] }],
});

describe("renderComment", () => {
  it("writes the comment in the tour's language", () => {
    const en = renderComment(tour("Lock out repeated logins", "Counts failures per user."));
    assert.match(en, /## 🎧 PR Docent review tour: Lock out repeated logins/);
    assert.match(en, /Made for commit `aaaaaaa`\./);
    assert.match(en, /### Chapters\n- \*\*1\*\* \(1 step\)/);
    assert.doesNotMatch(en, /[가-힣]/);
    const ko = renderComment(tour("로그인 잠금", "사용자별 실패 횟수를 셉니다."));
    assert.match(ko, /## 🎧 PR Docent 리뷰 투어: 로그인 잠금/);
    assert.match(ko, /### 챕터/);
  });
  it("keeps tour text from breaking the comment's sections", () => {
    const raw = { ...tour("T", "n"), skipped: [{ file: "a.txt", reason: "generated</details>\n\n## Hijacked" }] };
    const body = renderComment(raw);
    assert.match(body, /- `a.txt` generated&lt;\/details> ## Hijacked/);
    // Code blocks show text as is; outside them, every section opened is closed once.
    const outside = body.replace(/```json\n.*?\n```/gs, "");
    assert.equal(outside.match(/<details>/g).length, outside.match(/<\/details>/g).length);
  });
  it("carries the tour for the extension to find", () => {
    const body = renderComment(tour("T", "n"));
    const blocks = [...body.matchAll(/```json\n(.*?)\n```/gs)].map((m) => m[1]);
    assert.equal(findTourInBlocks(blocks, { owner: "o", repo: "r", number: 3 }).title, "T");
  });
});
