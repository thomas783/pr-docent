You are writing a PR Docent short for pull request {{PR}}: a 30-45 second vertical explainer,
played with narration in the reviewer's browser, for teammates who will not read the code, such as
planners and people on other teams. It shows no code. Each scene is a simple picture of the idea
(a flow, a before-and-after, a structure, or a few points) that builds up while one sentence is
read aloud and subtitled.

## Inputs

- `{{OUT}}/tour.json`: the reviewers' tour of this PR. Start from it; it already knows what
  matters and why.
- `{{OUT}}/pr.json`: the PR's title, body and head commit.
- `{{OUT}}/pr.diff` and the changed files in the current directory, if you need to check a detail.

## Output

Write the short to `{{OUT}}/short.json`, then run

    node {{TOOLS}}/scripts/check-short.mjs {{OUT}}/short.json {{PR}}

and fix every problem it reports until it prints `OK`. Then stop. Use these absolute paths as
written and do not change directory: `{{OUT}}/short.json` is the only file you may write.

## Format

```json
{
  "version": 1,
  "pr": { "owner": "...", "repo": "...", "number": 0 },
  "title": "짧은 제목",
  "hook": "무엇이 왜 바뀌는지 한 문장",
  "scenes": [
    { "kind": "compare", "headline": "무엇이 달라지나", "narration": "한 문장",
      "before": { "label": "이전", "items": ["..."] }, "after": { "label": "이후", "items": ["..."] } },
    { "kind": "flow", "headline": "어떻게 동작하나", "narration": "한 문장",
      "steps": [{ "icon": "📝", "label": "짧은 이름", "detail": "한 줄 설명", "status": "same" },
                { "icon": "🤖", "label": "...", "detail": "...", "status": "new" }],
      "links": ["화살표 위 설명"] },
    { "kind": "structure", "headline": "어디에 들어가나", "narration": "한 문장",
      "groups": [{ "label": "계층이나 모듈", "items": [{ "icon": "📦", "label": "...", "status": "changed" }] }] },
    { "kind": "points", "headline": "기억할 것", "narration": "한 문장",
      "points": [{ "icon": "✅", "text": "짧은 요점" }] }
  ],
  "outro": "영향이나 확인할 점 한 문장"
}
```

## Rules

- Write in {{LANGUAGE}}. Plain words a non-developer understands: what changes for users, data,
  operations or the team. Name a component only when the picture needs it, and call it by what
  it does ("투어 검사기", "결제 모듈") rather than by a class or file name.
- 2 to 4 scenes that tell one story, usually: what changes (compare) → how it works (flow or
  structure) → what it means (points). Pick the kinds that fit this PR; do not force all four.
- Mark what this PR adds as `"status": "new"` and what it modifies as `"changed"`; leave the rest
  as `"same"` so the eye goes to the change.
- Keep it small enough for a phone: flow 2-5 steps, compare 1-3 items per side, structure 1-3
  groups and at most 8 items, points 2-3. Headlines at most 24 characters, labels at most 16,
  details at most 24, every sentence (hook, narration, outro) one sentence of at most 80.
- One emoji per icon, chosen to be recognisable at a glance.
- Never invent behaviour the PR does not have.
