You are writing a PR Docent review tour for pull request {{PR}}.

A tour guides a human reviewer through the diff on GitHub's Files changed page: a browser
extension scrolls to each step, highlights its lines and reads the note aloud with a speech
synthesizer, pointing at the lines each sentence talks about. Reviewers keep their eyes on the
code while they listen, so the tour must say what to look at and why, in reading order.

## Inputs

- `{{OUT}}/pr.json`: the PR's title, body and head commit.
- `{{OUT}}/pr.diff`: the diff exactly as GitHub shows it (3 lines of context).
- The current directory: the repository at the head commit (when generated locally, only the
  files this PR changes). Use the Read tool to see line numbers.

## Output

Write the tour to `{{OUT}}/tour.json`, then run

    node {{TOOLS}}/scripts/check-tour.mjs {{OUT}}/tour.json {{OUT}}/pr.diff {{PR}} --guidelines {{OUT}}/guidelines.md

and fix every problem it reports until it prints `OK`. Then stop. Do not post comments or
change any other file. Use these absolute paths as written and do not change directory:
`{{OUT}}/tour.json` is the only file you are allowed to write.

## Format

```json
{
  "version": 1,
  "pr": { "owner": "...", "repo": "...", "number": 0 },
  "title": "한 줄 제목",
  "summary": "PR이 무엇을 왜 바꾸는지 2~4문장",
  "chapters": [
    {
      "title": "1. 챕터 제목",
      "summary": "한 문장",
      "steps": [
        {
          "file": "path/from/repo/root.kt",
          "lines": [40, 58],
          "side": "right",
          "level": "focus",
          "note": [
            { "text": "이 문장이 설명하는 줄을 가리킵니다.", "lines": [41, 45] },
            { "text": "다음 문장은 다른 줄을 가리킵니다.", "lines": [50, 58] }
          ],
          "point": "리뷰어가 확인할 구체적인 질문"
        }
      ]
    }
  ],
  "skipped": [{ "file": "package-lock.json", "reason": "의존성 잠금 파일" }]
}
```

## Rules

Be brief. Reviewers listen while they look at the code, so every sentence must earn its place.
The checker enforces these limits for this diff ({{CHANGED_LINES}} changed lines):
- At most {{MAX_STEPS}} steps in total.
- At most {{SENTENCES_PER_STEP}} sentences per step, each at most {{SENTENCE_CHARS}} characters.
- `point`: one question, at most {{POINT_CHARS}} characters.
- `summary`: at most {{SUMMARY_CHARS}} characters; each chapter `summary`: at most
  {{CHAPTER_SUMMARY_CHARS}}.

Coverage and order
- Every changed file must be visited by a step or listed in `skipped` with a short reason.
- Make steps only for changes a reviewer must think about. Put trivial changes in `skipped`
  instead of steps: comment or doc-comment edits, imports, docs, test fixtures that pass values
  through, lock files, generated code, renames, binaries. A file can have a step for its real
  change and nothing for its trivial ones.
- Merge neighbouring changes that make one point into one step; never repeat a step.
- Order chapters the way a person should read the change, not by file path: what changes and
  why, then the core logic, then how it is wired in, then tests.

Lines
- `lines` are line numbers in the new file (`"side": "right"`, the default). Use
  `"side": "left"` with old-file numbers only for code that was deleted.
- Every line in a step's range must be shown in the diff: inside a hunk, not in the
  unchanged code GitHub folds away. The checker lists what each file shows.
- Each note sentence's `lines` must sit inside its step's `lines` and point exactly at what
  that sentence talks about, usually 1-8 lines. Leave `lines` out for a sentence about the
  step as a whole.

Notes are spoken aloud
- Write in {{LANGUAGE}}. One sentence per note entry, one idea per sentence.
- Say why the change matters: intent, risk, or how it connects to other code. Do not restate
  what the code plainly shows ("adds a parameter", "imports X", "updates the comment").
- Avoid symbols, brackets and long lists that sound bad in speech. Name identifiers as written.

Levels and review points
- `focus`: where a bug would hurt or a design decision is made; at most about a third of the
  steps. `skim`: worth a look.
- `point` is one concrete question for the reviewer, grounded in the code you read: an edge
  case, a failure mode, a contract another caller relies on. Leave it out when there is nothing
  real to check. Never invent problems.

{{GUIDELINES}}