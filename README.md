# PR Docent

**English** | [한국어](README.ko.md)

A Chrome extension that acts as a docent for GitHub pull requests: on the **Files changed** page it takes a reviewer on a **tour** of the change. It breaks a pull request of thousands of lines into chapters, moves through the files and lines **in the order to read them**, frames them, and reads out what to look at. For teammates who won't read the code, it also plays a **short**: a 30-45 second explanation in pictures.

> Status: in development. Not on the Chrome Web Store yet; install it in developer mode. Tours and shorts are written by Claude Code, either in GitHub Actions or on your own computer.

| Term | Meaning |
|---|---|
| **Tour** | A guided walk through the diff for reviewers: chapters of steps, each pointing at lines with a note. |
| **Short** | A 30-45 second explanation in pictures for people who won't read the code, played in the extension. |
| **Video file** | A short saved as an MP4 to share outside GitHub (optional, macOS). |
| **Local helper** | The small program `npx pr-docent install` registers, which runs your Claude Code for the extension. |

## Features

- Chapters, progress, previous / play / next, **skip between focus steps**, keyboard shortcuts
- Scrolls to each step's file and lines and frames them, leaving GitHub's green and red for added and removed lines visible; the rest of the diff fades.
- Points at the lines each sentence talks about while it is read (when `note` is a list of sentences).
- Importance per step: **focus** (read carefully), **skim**, **skippable**
- Reads notes aloud with the browser's built-in speech synthesis (adjustable speed). No network requests, no cost.
- **Files the tour doesn't cover**, so nothing is missed by trusting the tour.
- Expands large diffs that GitHub collapses ("Load Diff").
- Narrows the page while the panel is open so the diff isn't hidden behind it.
- Remembers where you were in each pull request.
- **Shorts:** watch a picture-based explanation of the pull request right in the panel.
- Interface in English (default) and Korean. Click the PR Docent icon in the toolbar to choose automatic (browser language), English or 한국어. Tours generated locally are written in the chosen language, and narration follows the tour's own language.

## Keyboard shortcuts

GitHub's diff view already uses the arrow keys and single letters, so PR Docent only uses Alt (Option on a Mac) combinations. They do nothing while you are typing a comment.

| Keys | Action |
|---|---|
| `Alt` + `→` / `←` | Next / previous step |
| `Alt` + `↓` / `↑` | Skip to the next / previous **focus** step |
| `Alt` + `P` | Play / pause |

## Install (development)

1. Turn on **Developer mode** in `chrome://extensions`.
2. Click **Load unpacked** and choose this folder.
3. Open a pull request's Files changed tab; the **PR Docent** button appears at the bottom right.

## Generating tours automatically (GitHub Actions)

Whenever a pull request is opened or gets new commits, Claude Code reads the diff, writes a tour and posts it as a comment. On the Files changed tab the extension finds that comment and loads the tour. It reads it with your own GitHub session, so private repositories need no extra token.

1. Create an OAuth token with your Claude subscription. Generating tours uses that subscription's quota.
   ```bash
   claude setup-token
   ```
2. Add it as a secret to the repository that should get tours.
   ```bash
   gh secret set CLAUDE_CODE_OAUTH_TOKEN -R <owner>/<repo>
   ```
3. Add `.github/workflows/pr-docent.yml` to that repository.
   ```yaml
   name: PR Docent tour
   on:
     pull_request:
       types: [opened, synchronize, reopened, ready_for_review]
   concurrency:
     group: pr-docent-tour-${{ github.event.pull_request.number }}
     cancel-in-progress: true
   jobs:
     tour:
       if: github.event.pull_request.draft == false && github.event.pull_request.head.repo.full_name == github.repository
       uses: thomas783/pr-docent/.github/workflows/generate-tour.yml@main
       secrets:
         CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
       permissions:
         contents: read
         pull-requests: write
   ```

How it works
- Claude may write only the tour file; it can read the rest of the repository but not change it.
- `scripts/check-tour.mjs` checks the tour: its format, that every line number is shown in the diff, that each sentence's lines sit inside its step, and that every changed file is visited or skipped with a reason. Claude fixes the tour until it passes; if it never does, no comment is posted.
- After the tour, Claude also writes a **short** from it and the comment carries both; if the short fails its checks, the tour is posted without it.
- There is one comment per pull request, updated on every new commit.
- The `model` (default `claude-opus-5-5`) and `language` (default `한국어`) inputs change the model and the tour's language.
- Pull requests from forks get no secrets, so they are skipped.

## Generating tours locally (your own Claude Code)

Without any repository setup, the panel's **Create a tour with local Claude Code** button makes a tour of the pull request you are looking at. It uses Claude Code and the subscription on your own computer, so there is no API key or extra cost, and it works on pull requests in repositories you can't configure.

Setup (once per computer, macOS and Linux)
1. Install [Claude Code](https://claude.com/claude-code) and log in.
2. Register the local helper with Chrome. Requires Node.js 18 or later.
   ```bash
   npx pr-docent install
   ```
   This copies the helper and a launcher script to `~/.pr-docent/` and writes `dev.prdocent.host.json` to Chrome's `NativeMessagingHosts` folder. Only this extension (ID `hleefogoiedjahnmjgmmgonckaeicppc`) may connect; add other IDs with `--extension-id <ID>`. In this repository `npm run install-host` does the same.
3. Reload the extension in `chrome://extensions`.

How it works
- The extension fetches the pull request's diff and changed files with your session and hands them to the local helper (`host/pr-docent-host.mjs`).
- The helper runs `claude -p` in a temporary folder with the same prompt and checker as GitHub Actions; Claude may write only the tour file.
- The checked tour is saved for the pull request and starts playing. It usually takes 2-3 minutes.
- To remove it: `npx pr-docent uninstall`

## Shorts

A short explains a pull request in 30-45 seconds **with pictures instead of code**, for teammates who won't read the code, such as planners. It has an opening card, 2-4 picture scenes and a closing card; each scene has a large headline and a picture that builds up while its sentence is read aloud and subtitled.

- Picture kinds: **flow** (what happens in order), **before and after**, **structure** (modules and layers) and **key points**. What the pull request adds is marked NEW in purple and what it changes in yellow.
- Where it comes from: the GitHub Actions workflow writes one with every tour, or **More → Make a short** in the panel writes one with your local Claude Code from the current tour (about a minute).
- Watching: the **video button** (Watch the short) next to the controls plays it over the page, live in your browser. Nothing is rendered or saved; only the script (a few KB) is kept with the tour.
- Claude Code writes the script from the tour, and `scripts/check-short.mjs` checks that it fits a phone screen (number of scenes, boxes and items; headline, label and sentence lengths).

Saving a short as a video file (optional, macOS)
- **More → Save as a video file** renders it to `~/Downloads/pr-docent-<owner>-<repo>-<number>.mp4` (1080×1920) for sharing outside GitHub, and **Show in Finder** finds the file.
- From a terminal: `npx pr-docent short <owner/repo#number | pull request URL>` writes the script and the video file (needs `gh` logged in; uses the tour in the pull request's comments, or `--tour <file>`).
- Requires the local helper, Google Chrome and ffmpeg (`brew install ffmpeg`). Narration uses macOS `say` (Yuna for Korean, Samantha for English).

## Changing how tours are generated (`.github/pr-docent.md`)

Both GitHub Actions and local generation make short tours by default: at most 3 steps plus 1 per 25 changed lines (20 at most), 3 sentences per step and 80 characters per sentence. Trivial changes such as comment-only edits, imports and docs go in the skipped files instead of steps. The checker enforces these limits and Claude cuts the tour until it fits.

A repository can add its own rules in `.github/pr-docent.md`. The front matter between `---` lines changes the limits, and the rest is appended to the generator's instructions, taking precedence over the defaults.

```markdown
---
maxSteps: 6            # step limit (default: 3 + 1 per 25 changed lines, at most 20)
sentencesPerStep: 2    # sentences per step (default 3)
sentenceChars: 100     # sentence length (default 80)
pointChars: 120        # review point length (default 120)
summaryChars: 200      # pull request summary length (default 200)
chapterSummaryChars: 60
---
- Use the domain terms ledger, allocation and derived line.
- Always treat Flyway migration files as focus steps.
```

The file is read from the pull request's head commit, so a pull request that changes the rules is toured with the new rules.

## Loading tours

- A tour posted in the pull request's comments is loaded automatically. A tour you loaded or generated yourself takes precedence.
- A file named `tours/<owner>--<repo>--<number>.json` is loaded for that pull request.
- Example: [`tours/thomas783--pr-docent--1.json`](tours/thomas783--pr-docent--1.json) tours this repository's [PR #1](https://github.com/thomas783/pr-docent/pull/1/changes) (keyboard shortcuts and skipping between focus steps). With the extension installed, open that pull request to review PR Docent's own change with PR Docent.
- Tours you put in that folder are loaded automatically and are not committed (see `.gitignore`); only public examples are committed.
- For any other pull request, choose a file with **Load tour JSON** in the panel. The loaded tour is saved for that pull request.

## Tour format (version 1)

```json
{
  "version": 1,
  "pr": { "owner": "your-org", "repo": "your-repo", "number": 42 },
  "title": "Tour title",
  "summary": "What the pull request does",
  "chapters": [
    {
      "title": "1. Domain model",
      "summary": "What this chapter covers",
      "steps": [
        { "file": "src/Foo.kt", "lines": [10, 24], "side": "right", "level": "focus", "note": "What to look at here" }
      ]
    }
  ],
  "skipped": [{ "file": "gradlew", "reason": "generated file" }]
}
```

| Field | Meaning |
|---|---|
| `lines` | `[start, end]` line numbers. Without it the step goes to the whole file. |
| `side` | `right` (after the change, default) or `left` (before the change, for deleted lines) |
| `level` | `focus`, `skim` (default) or `skip` |
| `note` | A string, or a list `[{ "text": "...", "lines": [start, end] }, ...]` so the lines each sentence talks about are framed while it is read. |
| `point` | What the reviewer should check (optional). Shown in its own box and read after the note. |
| `skipped` | Files left out on purpose, with a reason. They don't count as uncovered. |

## How it hooks into GitHub

Based on GitHub's 2026 Files changed page. If GitHub changes it, only `src/github.js` needs updating.

- File element ID: `diff-` + the SHA-256 of the file path
- Line cells: `data-line-anchor="diff-<hash>R<line>"` (`L` for the deleted side)
- Changing the URL hash doesn't scroll, so PR Docent scrolls itself.
- Highlights are CSS rules keyed on the line anchors rather than classes on elements, so they survive GitHub (React) redrawing the page.
- For files that are off screen or collapsed, it scrolls to the file, waits for it to render and clicks "Load Diff" when needed.

## Development

- There is no build step. The content script (`src/loader.js`) imports ES modules (`src/main.js`).
- Tests: `npm test` (Node's built-in test runner). They cover tour validation, checking against the diff, playback state, shortcuts, URL parsing, GitHub's file ID hash, line selectors, translations, the native messaging protocol and short scripts.
- Publishing to npm: bump `package.json`'s version, merge, then run `npm publish --access public` from `main` (needs 2FA). A trusted-publishing workflow (`publish.yml`, triggered by an `npm-v<version>` tag) is ready, but don't push those tags until the trusted publisher is registered on npm.
- Checking a tour: `node scripts/check-tour.mjs <tour.json> <pr.diff> [owner/repo#number]` (`gh pr diff <number> > pr.diff`)

## License

MIT

## Next

1. **Chrome Web Store listing:** icons, screenshots and a privacy notice
