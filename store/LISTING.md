# Chrome Web Store listing

What to enter in the [developer dashboard](https://chrome.google.com/webstore/devconsole). The store
listing has an English (default) and a Korean version: add Korean under **Store listing → Language**.

Upload: `npm run package` → `dist/pr-docent-<version>.zip`.

## Store listing

| Field | Value |
|---|---|
| Category | Developer Tools |
| Language | English (default), Korean |
| Icon | `icons/icon-128.png` |
| Screenshots (1280×800) | English: `store/screenshots/en-1-tour.png`, `en-2-narration.png`, `en-3-short.png`<br>Korean: `store/screenshots/ko-1-tour.png`, `ko-2-narration.png`, `ko-3-short.png` |
| Small promo tile (440×280) | `store/screenshots/en-promo.png` (Korean: `ko-promo.png`) |
| Homepage | https://github.com/thomas783/pr-docent |
| Support | https://github.com/thomas783/pr-docent/issues |

The name and the summary come from `_locales/*/messages.json` (`extName`, `extDescription`).

### Description (English)

```
PR Docent takes you on a tour of a GitHub pull request, right on the Files changed page.

A large pull request is a long list of files in alphabetical order. PR Docent breaks it into chapters and walks through the files and lines in the order to read them: it scrolls to each step, frames the lines, fades the rest of the diff, and reads out what to look at.

• Steps marked Focus, Skim or Skippable, and a button that jumps straight to the next Focus step
• Narration with your browser's built-in voices, pointing at the lines each sentence talks about
• Review points: what to check at each step
• Files the tour doesn't cover, so nothing is missed by trusting it
• Shorts: a 30–45 second explanation in pictures for teammates who won't read the code, played right on the page
• Keyboard shortcuts (Alt + arrows, Alt + P)
• English and Korean

Where tours come from
• GitHub Actions: add one workflow and Claude Code writes a tour (and a short) for every pull request and posts it as a comment. The extension loads it automatically, with your own GitHub session, so private repositories work too.
• Your computer: run `npx pr-docent install` once, then click "Create a tour with local Claude Code" in the panel. It uses your own Claude Code and subscription, with no API key.

Try it on the demo pull request: https://github.com/thomas783/pr-docent/pull/22/changes

PR Docent has no server. It doesn't collect, sell or send your data anywhere; tours are kept in Chrome on your computer. Setup and source: https://github.com/thomas783/pr-docent
```

### Description (Korean)

```
PR Docent는 GitHub 풀 리퀘스트의 Files changed 화면에서 리뷰 투어를 안내합니다.

큰 PR은 알파벳 순서로 늘어선 긴 파일 목록입니다. PR Docent는 PR을 챕터로 나누고, 읽어야 할 순서대로 파일과 줄을 따라갑니다. 단계마다 해당 줄로 스크롤해 테두리를 두르고, 나머지 diff는 흐리게 하고, 무엇을 봐야 하는지 읽어 줍니다.

• 단계별 중요도(집중, 훑기, 생략 가능)와 다음 집중 단계로 바로 건너뛰는 버튼
• 브라우저 내장 음성으로 설명을 읽고, 문장마다 해당 줄을 가리킴
• 리뷰 포인트: 단계마다 확인할 점
• 투어가 다루지 않은 파일 목록: 투어만 믿고 놓치는 파일이 없게 함
• 쇼츠: 코드를 읽지 않는 팀원을 위한 30~45초짜리 그림 설명을 페이지 위에서 바로 재생
• 단축키 (Alt + 방향키, Alt + P)
• 영어와 한국어 지원

투어를 만드는 방법
• GitHub Actions: 워크플로 하나를 추가하면 PR마다 Claude Code가 투어와 쇼츠를 써서 코멘트로 올립니다. 확장은 사용자 본인의 GitHub 세션으로 이를 자동으로 불러오므로 비공개 레포에서도 동작합니다.
• 내 컴퓨터: `npx pr-docent install`을 한 번 실행한 뒤, 패널에서 "로컬 Claude Code로 투어 생성"을 누릅니다. 본인의 Claude Code와 구독을 쓰므로 API 키가 필요 없습니다.

데모 PR에서 바로 체험해 보세요: https://github.com/thomas783/pr-docent/pull/23/changes

PR Docent는 서버가 없습니다. 데이터를 수집하거나 판매하거나 외부로 보내지 않으며, 투어는 사용자 컴퓨터의 Chrome에 저장됩니다. 설치 방법과 소스: https://github.com/thomas783/pr-docent
```

### Regenerating the screenshots

The screenshots come from the demo pull requests (#22 in English, #23 in Korean, with the panel's
language set to match) and the short player. `store/compose.html` lays a capture out at 1280×800
with a caption (`?layout=wide|side|promo&img=…&title=…&text=…`); serve the repository and the
captures over HTTP and screenshot its `#out` element.

## Privacy practices

### Single purpose

```
Plays guided, narrated review tours of GitHub pull requests on the pull request's Files changed page.
```

### Permission justifications

| Permission | Justification |
|---|---|
| `storage` | Keeps the user's settings (language, narration, speed) and, per pull request, the tour, the short and the position in the tour, on the user's computer. |
| `nativeMessaging` | Talks to the optional PR Docent local helper the user installs (`npx pr-docent install`), which runs the user's own Claude Code to write a tour or a short, or saves a short as a video file, when the user clicks those buttons. |
| Host `https://github.com/*` | The tour panel runs on pull request pages: it reads the page to point at lines and fetches the pull request's comments (for posted tours) and Files changed page (for its current commits) with the user's session. |
| Host `https://patch-diff.githubusercontent.com/*` | Fetches the pull request's diff, which the local helper needs to write a tour. GitHub redirects github.com/…/pull/N.diff to this host. |
| Host `https://raw.githubusercontent.com/*` | Fetches the changed files at the pull request's head commit, which the local helper needs to write a tour. GitHub redirects github.com/…/raw/… to this host. |

### Remote code

No, I am not using remote code. (All scripts are in the package; the extension loads no code from the network.)

### Data usage

Check **Website content** only. It is read to provide the extension's single purpose and, only when the user clicks a generate button, passed to the local helper on the user's computer, which sends it to Anthropic through the user's own Claude Code account. Nothing goes to the developer.

Then certify all three:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

Privacy policy URL: https://github.com/thomas783/pr-docent/blob/main/PRIVACY.md

## After the first upload

The store assigns its own extension ID (shown in the dashboard as soon as the draft is created). Add
it to `EXTENSION_IDS` in `host/native.mjs` and publish a new npm version, or the local helper will
refuse the store version of the extension.
