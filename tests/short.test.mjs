import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkShort, parseShort, revealSteps } from "../src/short.js";

const flow = { kind: "flow", headline: "자동 생성", narration: "PR을 올리면 투어가 만들어집니다.", steps: [{ icon: "📝", label: "PR" }, { label: "Claude", status: "new" }], links: ["실행"] };
const compare = { kind: "compare", headline: "전과 후", narration: "이제 자동입니다.", before: { label: "이전", items: ["손으로 작성"] }, after: { label: "이후", items: ["자동 생성", "검사 통과"] } };
const structure = { kind: "structure", headline: "구조", narration: "어댑터를 바꿔 끼웁니다.", groups: [{ label: "core", items: [{ label: "포트" }] }, { label: "adapters", items: [{ label: "S3" }, { label: "GCS", status: "new" }] }] };
const points = { kind: "points", headline: "요점", narration: "두 가지만 기억하세요.", points: [{ icon: "✅", text: "검사" }, { text: "공유" }] };
const short = (scenes, extra = {}) =>
  parseShort({ version: 1, pr: { owner: "o", repo: "r", number: 1 }, title: "제목", hook: "왜 바꾸나.", outro: "끝.", scenes, ...extra });

describe("parseShort", () => {
  it("normalizes every scene kind", () => {
    const { short: s, errors } = short([flow, compare, structure, points]);
    assert.deepEqual(errors, []);
    assert.equal(s.scenes[0].steps[0].status, "same");
    assert.equal(s.scenes[0].steps[1].status, "new");
    assert.deepEqual(s.scenes[1].after.items, ["자동 생성", "검사 통과"]);
    assert.equal(s.scenes[2].groups[1].items[1].status, "new");
    assert.equal(s.scenes[3].points[1].icon, "");
  });

  it("collects every problem", () => {
    const { short: s, errors } = parseShort({ version: 2, pr: {}, scenes: [{ kind: "chart" }, { kind: "flow", headline: "h", narration: "n", steps: [{ status: "gone" }] }] });
    assert.equal(s, null);
    assert.deepEqual(errors, [
      "Unsupported short version: 2",
      "pr.owner, pr.repo and pr.number are required",
      "title is required",
      "hook is required",
      "outro is required",
      "scenes[0].kind must be one of flow, compare, structure, points",
      "scenes[0].headline is required",
      "scenes[0].narration is required",
      "scenes[1].steps[0].status must be one of new, changed, same",
      "scenes[1].steps[0].label is required",
    ]);
  });
});

describe("checkShort", () => {
  it("accepts a short that fits a phone", () => {
    assert.deepEqual(checkShort(short([flow, compare]).short), []);
  });

  it("reports crowded and wordy scenes", () => {
    const crowded = { ...flow, headline: "가".repeat(25), steps: Array.from({ length: 6 }, (_, i) => ({ label: `단계${i}` })) };
    const errors = checkShort(short([crowded]).short);
    assert.equal(errors.length, 3);
    assert.match(errors[0], /^scenes .*: 1; use 2-4/);
    assert.match(errors[1], /headline is 25 characters; at most 24/);
    assert.match(errors[2], /steps: 6; use 2-5/);
  });
});

describe("revealSteps", () => {
  it("reveals one element at a time", () => {
    const { short: s } = short([flow, compare, structure, points]);
    assert.deepEqual(s.scenes.map(revealSteps), [2, 2, 2, 2]);
  });
});
