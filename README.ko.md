# PR Docent

[English](README.md) | **한국어**

GitHub 풀 리퀘스트를 안내하는 도슨트 역할의 Chrome 확장입니다. **Files changed** 화면에서 리뷰어에게 변경 사항의 **투어**를 안내합니다. 수천 줄짜리 PR을 챕터로 나누고, **읽을 순서대로** 해당 파일과 줄로 이동하며 테두리로 표시하고, 볼 곳을 음성으로 읽어 줍니다. 코드를 읽지 않는 팀원을 위해서는 30~45초 동안 그림으로 설명하는 **쇼츠**도 재생합니다.

> 상태: 개발 중. Chrome 웹 스토어에는 아직 없으며 개발자 모드로 설치합니다. 투어와 쇼츠는 GitHub Actions나 본인 컴퓨터의 Claude Code가 작성합니다.

| 용어 | 뜻 |
|---|---|
| **투어** | 리뷰어를 위한 diff 안내. 챕터와 단계로 이루어지고, 단계마다 줄을 가리키며 설명합니다. |
| **쇼츠** | 코드를 읽지 않는 사람을 위한 30~45초짜리 그림 설명. 확장에서 재생합니다. |
| **영상 파일** | 쇼츠를 GitHub 밖에서 공유하려고 MP4로 저장한 것(선택, macOS). |
| **로컬 도우미** | `npx pr-docent install`로 등록하는 작은 프로그램. 확장 대신 본인의 Claude Code를 실행합니다. |

## 기능

- 챕터 목록, 진행률, 이전·재생·다음, **집중 단계만 골라 건너뛰기**, 단축키
- 단계마다 파일과 줄 범위로 스크롤하고 테두리로 표시합니다. GitHub의 초록색(추가)과 빨간색(삭제)은 그대로 보이고, 나머지 코드는 흐리게 처리합니다.
- 음성이 읽는 문장에 맞춰 해당 줄을 진한 테두리로 가리킵니다(`note`를 문장별 배열로 쓴 경우).
- 중요도 표시: **집중**(꼼꼼히 볼 곳), **훑기**, **생략 가능**
- 브라우저 내장 음성 합성으로 설명 읽기(속도 조절). 네트워크 요청이나 비용이 없습니다.
- **투어가 다루지 않은 파일** 목록: 투어만 믿고 놓치는 파일이 없게 합니다.
- 접힌 대용량 diff("Load Diff")는 자동으로 펼칩니다.
- 패널이 열려 있는 동안 diff가 패널에 가리지 않도록 페이지 폭을 줄입니다.
- PR마다 마지막 위치를 기억합니다.
- **Viewed**로 표시한 파일은 그대로 접어 둡니다. 그 파일의 단계에서는 열어서 볼지, 건너뛸지 묻습니다.
- Files changed에서 커밋이나 커밋 범위를 골라 보는 중에는 투어를 재생하지 않습니다. 투어의 줄 번호가 PR 전체 변경 기준이기 때문이며, 패널에서 전체 변경으로 돌아가는 링크를 보여 줍니다.
- **쇼츠:** PR을 그림으로 설명하는 쇼츠를 패널에서 바로 봅니다.
- 화면 언어는 영어(기본)와 한국어를 지원합니다. 툴바의 PR Docent 아이콘을 눌러 자동(브라우저 언어), English, 한국어 중에서 고릅니다. 로컬에서 만드는 투어도 고른 언어로 작성되고, 음성은 투어 문장의 언어에 맞춰 읽습니다.

## 단축키

GitHub의 diff 화면은 화살표 키와 한 글자 단축키를 이미 쓰므로, PR Docent는 Alt(Mac은 Option) 조합만 씁니다. 코멘트를 입력하는 중에는 동작하지 않습니다.

| 단축키 | 동작 |
|---|---|
| `Alt` + `→` / `←` | 다음 / 이전 단계 |
| `Alt` + `↓` / `↑` | 다음 / 이전 **집중** 단계로 건너뛰기 |
| `Alt` + `P` | 재생 / 일시정지 |

## 설치 (개발용)

1. `chrome://extensions`에서 **개발자 모드**를 켭니다.
2. **압축해제된 확장 프로그램을 로드합니다**를 누르고 이 폴더를 선택합니다.
3. PR의 Files changed 탭을 열면 오른쪽 아래에 **PR Docent** 버튼이 나타납니다.

## 투어 자동 생성 (GitHub Actions)

PR이 열리거나 커밋이 추가될 때마다 Claude Code가 diff를 읽고 투어를 만들어 PR 코멘트로 올립니다. 확장은 Files changed 탭에서 그 코멘트를 찾아 투어를 자동으로 불러옵니다. 비공개 저장소에서도 로그인한 사용자 권한으로 읽으므로 별도 토큰이 필요 없습니다.

1. Claude 구독 계정으로 OAuth 토큰을 만듭니다. 생성에는 그 구독의 사용량이 쓰입니다.
   ```bash
   claude setup-token
   ```
2. 투어를 만들 저장소에 secret으로 등록합니다.
   ```bash
   gh secret set CLAUDE_CODE_OAUTH_TOKEN -R <owner>/<repo>
   ```
3. 그 저장소에 `.github/workflows/pr-docent.yml`을 추가합니다.
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

동작 방식
- Claude는 투어 파일 하나만 쓸 수 있고, 저장소의 다른 파일은 읽기만 합니다.
- `scripts/check-tour.mjs`가 투어를 검사합니다. 형식, 모든 줄 번호가 실제 diff 화면에 보이는지, 문장별 줄이 단계 범위 안에 있는지, 바뀐 파일을 모두 다루거나 건너뛴 이유를 적었는지 확인합니다. Claude는 검사를 통과할 때까지 고치고, 통과하지 못하면 코멘트를 올리지 않습니다.
- 투어 다음에 Claude가 그 투어로 **쇼츠** 대본도 쓰고, 코멘트에 둘을 함께 담습니다. 쇼츠가 검사를 통과하지 못하면 투어만 올립니다.
- 코멘트는 PR마다 하나이며, 새 커밋이 올라오면 같은 코멘트를 갱신합니다.
- 입력값 `model`(기본 `claude-opus-5-5`)과 `language`(기본 `한국어`)로 모델과 언어를 바꿀 수 있습니다.
- 포크에서 온 PR에는 secret이 전달되지 않으므로 실행하지 않습니다.

## 투어 로컬 생성 (본인 Claude Code)

저장소 설정 없이, 패널의 **로컬 Claude Code로 투어 생성** 버튼으로 지금 보고 있는 PR의 투어를 만듭니다. 본인 컴퓨터의 Claude Code와 구독을 쓰므로 API 키나 추가 비용이 없고, 설정 권한이 없는 저장소의 PR에서도 됩니다.

준비 (컴퓨터마다 한 번, macOS와 Linux)
1. [Claude Code](https://claude.com/claude-code)를 설치하고 로그인합니다.
2. 로컬 도우미를 Chrome에 등록합니다. Node.js 18 이상이 필요합니다.
   ```bash
   npx pr-docent install
   ```
   `~/.pr-docent/`에 도우미 파일과 실행 스크립트를 복사하고, Chrome의 `NativeMessagingHosts` 폴더에 `dev.prdocent.host.json`을 만듭니다. 이 확장(ID `hleefogoiedjahnmjgmmgonckaeicppc`)만 연결할 수 있으며, 다른 ID는 `--extension-id <ID>`로 추가합니다. 이 저장소에서는 `npm run install-host`도 같습니다.
3. `chrome://extensions`에서 확장을 새로고침합니다.

동작 방식
- 확장이 로그인 세션으로 PR의 diff와 바뀐 파일을 가져와 로컬 도우미(`host/pr-docent-host.mjs`)에 넘깁니다.
- 도우미가 임시 폴더에서 `claude -p`를 실행합니다. GitHub Actions와 같은 프롬프트와 검사기를 쓰고, Claude는 투어 파일 하나만 쓸 수 있습니다.
- 검사를 통과한 투어를 이 PR에 저장하고 바로 재생합니다. 생성에는 보통 2~3분이 걸립니다.
- 제거: `npx pr-docent uninstall`

## 쇼츠

쇼츠는 PR을 30~45초 동안 **코드 대신 그림으로** 설명합니다. 기획자처럼 코드를 읽지 않는 팀원을 위한 것입니다. 제목 카드, 그림 장면 2~4개, 마무리 카드로 구성되고, 장면마다 큰 헤드라인과 그림이 문장을 읽는 동안 한 요소씩 나타나며 자막도 표시됩니다.

- 그림 종류: **흐름도**(처리 순서), **전후 비교**, **구조도**(모듈과 계층), **핵심 요점**. 이 PR이 새로 만든 부분은 보라색 NEW, 바꾼 부분은 노란색으로 표시합니다.
- 만드는 곳: GitHub Actions 워크플로가 투어와 함께 만들거나, 패널의 **더 보기 → 쇼츠 만들기**로 지금 투어를 바탕으로 본인의 Claude Code가 만듭니다(약 1분).
- 보기: 조작 버튼 옆의 **영상 버튼**(쇼츠 보기)을 누르면 페이지 위에서 브라우저가 바로 재생합니다. 영상을 렌더링하거나 저장하지 않고, 몇 KB짜리 대본만 투어와 함께 보관합니다.
- 대본은 Claude Code가 투어를 바탕으로 쓰고, 검사기(`scripts/check-short.mjs`)가 휴대폰 화면에 맞는지(장면 수, 상자와 항목 수, 헤드라인·라벨·문장 길이) 확인합니다.

쇼츠를 영상 파일로 저장하기 (선택, macOS)
- **더 보기 → 영상 파일로 저장**을 누르면 GitHub 밖에서 공유할 수 있도록 `~/Downloads/pr-docent-<owner>-<repo>-<번호>.mp4`(1080×1920)로 저장하고, **Finder에서 보기**로 파일을 찾습니다.
- 터미널에서는 `npx pr-docent short <owner/repo#번호 | PR 주소>`로 대본과 영상 파일을 함께 만듭니다(`gh` 로그인 필요, PR 코멘트의 투어나 `--tour <파일>`을 씁니다).
- 필요한 것: 로컬 도우미, Google Chrome, ffmpeg(`brew install ffmpeg`). 음성은 macOS의 `say`(한국어 Yuna, 영어 Samantha)를 씁니다.

## 투어 생성 규칙 바꾸기 (`.github/pr-docent.md`)

Actions 생성과 로컬 생성 모두 기본적으로 짧은 투어를 만듭니다. 단계 수는 바뀐 줄 25줄당 1개에 3을 더한 값까지(최대 20)이고, 단계마다 문장 3개, 문장마다 80자까지입니다. 주석만 바뀐 곳, 임포트, 문서처럼 사소한 변경은 단계 대신 "건너뛴 파일"에 넣습니다. 검사기가 이 기준을 확인하고, 넘으면 Claude가 다시 줄입니다.

저장소에 `.github/pr-docent.md`를 두면 그 저장소의 규칙을 더할 수 있습니다. 앞부분 `---` 블록은 숫자 기준을 바꾸고, 본문은 생성 지시문 뒤에 붙어 기본 규칙보다 우선합니다.

```markdown
---
maxSteps: 6            # 단계 수 상한 (기본: 3 + 바뀐 줄 25줄당 1, 최대 20)
sentencesPerStep: 2    # 단계당 문장 수 (기본 3)
sentenceChars: 100     # 문장 길이 (기본 80자)
pointChars: 120        # 리뷰 포인트 길이 (기본 120자)
summaryChars: 200      # PR 요약 길이 (기본 200자)
chapterSummaryChars: 60
---
- 도메인 용어는 원장, 안분, 파생 라인으로 씁니다.
- Flyway 마이그레이션 파일은 항상 집중 단계로 다룹니다.
```

PR의 head 커밋에 있는 파일을 읽으므로, 규칙을 바꾸는 PR에서는 바뀐 규칙으로 생성됩니다.

## 투어 불러오기

- PR 코멘트에 자동 생성된 투어가 있으면 그 투어를 불러옵니다. 로컬에서 생성한 투어가 있으면 그쪽이 우선합니다.
- `tours/<owner>--<repo>--<number>.json` 파일이 있으면 해당 PR에서 자동으로 불러옵니다.
- 예제: [`tours/thomas783--pr-docent--1.json`](tours/thomas783--pr-docent--1.json) — 이 레포의 [PR #1](https://github.com/thomas783/pr-docent/pull/1/changes)(단축키와 집중 단계 건너뛰기)을 리뷰하는 투어입니다. 확장을 설치한 뒤 이 PR을 열면, PR Docent로 PR Docent 자신의 변경을 리뷰해 볼 수 있습니다.
- 직접 만든 투어는 같은 폴더에 두면 자동으로 불러오고, 커밋되지 않습니다(`.gitignore` 참고). 공개 예제만 커밋합니다.

## 투어 형식 (version 1)

```json
{
  "version": 1,
  "pr": { "owner": "your-org", "repo": "your-repo", "number": 42 },
  "title": "투어 제목",
  "summary": "PR 요약",
  "chapters": [
    {
      "title": "1. 도메인 모델",
      "summary": "챕터 설명",
      "steps": [
        { "file": "src/Foo.kt", "lines": [10, 24], "side": "right", "level": "focus", "note": "이 단계에서 볼 것" }
      ]
    }
  ],
  "skipped": [{ "file": "gradlew", "reason": "생성된 파일" }]
}
```

| 필드 | 설명 |
|---|---|
| `lines` | `[시작, 끝]` 줄 번호. 생략하면 파일 전체로 이동합니다. |
| `side` | `right`(변경 후, 기본값) 또는 `left`(변경 전, 삭제된 줄) |
| `level` | `focus`, `skim`(기본값), `skip` |
| `note` | 설명 문자열. 또는 `[{ "text": "...", "lines": [시작, 끝] }, ...]` 배열로 쓰면 음성이 각 문장을 읽는 동안 그 줄을 진하게 가리킵니다. |
| `point` | 리뷰어가 확인할 점(선택). 패널에 강조 상자로 보이고, 설명 다음에 따로 읽어 줍니다. |
| `skipped` | 일부러 건너뛴 파일과 이유. "다루지 않은 파일" 목록에서 빠집니다. |

## GitHub 화면 연동 방식

GitHub의 2026년 Files changed 화면 기준입니다. 화면 구조가 바뀌면 `src/github.js`만 고치면 됩니다.

- 파일 요소 ID: `diff-` + 파일 경로의 SHA-256
- 줄 셀: `data-line-anchor="diff-<해시>R<줄>"`(삭제 쪽은 `L`)
- URL 해시를 바꿔도 스크롤되지 않으므로 직접 스크롤합니다.
- 하이라이트는 요소에 클래스를 붙이지 않고 줄 앵커를 가리키는 CSS 규칙으로 적용합니다. GitHub(React)가 요소를 다시 그려도 유지됩니다.
- 화면 밖 파일과 접힌 파일은 그 파일로 스크롤한 뒤 내용이 그려질 때까지 기다리고, 필요하면 "Load Diff"를 누릅니다.

## 개발

- 빌드 단계가 없습니다. 콘텐츠 스크립트(`src/loader.js`)가 ES 모듈(`src/main.js`)을 불러옵니다.
- 테스트: `npm test` (Node 내장 테스트 러너). 투어 검증, diff 대조, 재생 상태, 단축키, PR 주소 해석, GitHub 파일 ID 해시, 줄 선택자, 번역, Native Messaging 통신, 쇼츠 대본을 다룹니다.
- npm 게시: `package.json`의 버전을 올려 머지한 뒤 main에서 `npm publish --access public`(2FA 필요). GitHub Actions의 trusted publishing 워크플로(`publish.yml`, `npm-v<버전>` 태그로 실행)는 준비되어 있지만, npm 쪽 trusted publisher 등록이 끝나기 전에는 태그를 푸시하지 않습니다.
- 투어 검사: `node scripts/check-tour.mjs <tour.json> <pr.diff> [owner/repo#number]` (`gh pr diff <number> > pr.diff`)

## 라이선스

MIT

## 다음 단계

1. **Chrome 웹 스토어 등록:** 아이콘, 스크린샷, 개인정보 처리 안내
