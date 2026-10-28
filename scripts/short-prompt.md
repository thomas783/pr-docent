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

Write every text in the short in {{LANGUAGE}}: the title, hook, headlines, narration, labels,
items and outro. The example below only shows the shape.

```json
{
  "version": 1,
  "pr": { "owner": "...", "repo": "...", "number": 0 },
  "title": "Short title",
  "hook": "One sentence on what changes and why",
  "scenes": [
    { "kind": "compare", "headline": "What changes", "narration": "One sentence",
      "before": { "label": "Before", "items": ["..."] }, "after": { "label": "After", "items": ["..."] } },
    { "kind": "flow", "headline": "How it works", "narration": "One sentence",
      "steps": [{ "icon": "📝", "label": "Short name", "detail": "One-line detail", "status": "same" },
                { "icon": "🤖", "label": "...", "detail": "...", "status": "new" }],
      "links": ["Label on the arrow"] },
    { "kind": "structure", "headline": "Where it fits", "narration": "One sentence",
      "groups": [{ "label": "Layer or module", "items": [{ "icon": "📦", "label": "...", "status": "changed" }] }] },
    { "kind": "points", "headline": "Remember", "narration": "One sentence",
      "points": [{ "icon": "✅", "text": "Short point" }] }
  ],
  "outro": "One sentence on the impact or what to check"
}
```

## Rules

- Write in {{LANGUAGE}}. Plain words a non-developer understands: what changes for users, data,
  operations or the team. Name a component only when the picture needs it, and call it by what
  it does ("the tour checker", "the payment module") rather than by a class or file name.
- 2 to 4 scenes that tell one story, usually: what changes (compare) → how it works (flow or
  structure) → what it means (points). Pick the kinds that fit this PR; do not force all four.
- Mark what this PR adds as `"status": "new"` and what it modifies as `"changed"`; leave the rest
  as `"same"` so the eye goes to the change.
- Keep it small enough for a phone: flow 2-5 steps, compare 1-3 items per side, structure 1-3
  groups and at most 8 items, points 2-3. Headlines at most 24 characters, labels at most 16,
  details at most 24, every sentence (hook, narration, outro) one sentence of at most 80.
- One emoji per icon, chosen to be recognisable at a glance.
- Never invent behaviour the PR does not have.
