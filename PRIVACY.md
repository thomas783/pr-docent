# PR Docent privacy policy

**English** | [한국어](#pr-docent-개인정보-처리방침)

Last updated: 2026-11-02

PR Docent is a Chrome extension that plays review tours on GitHub pull requests. It has no server of its own and the developer receives no data from it.

## What it reads

- **GitHub pages you open.** On a pull request, the extension reads the page and fetches the pull request's diff, changed files, title, description and comments from github.com, patch-diff.githubusercontent.com and raw.githubusercontent.com with your own browser session. It does this to find tours and shorts posted in the comments, to point at lines on the page, and to check whether a tour matches the pull request's current commits.
- **Your settings.** Language, narration on or off, and narration speed.

## What it stores

In Chrome's extension storage on your computer only: your settings, tours and shorts made for each pull request, where you were in each tour, and the path of a video file you saved. Removing the extension removes them.

## What it sends, and to whom

- **Nothing to the developer, except feedback you choose to send.** There are no analytics, ads or tracking.
- **Feedback, only when you press Send.** The optional feedback form in the toolbar popup sends what you typed, the feedback type (bug, idea or question), the extension version and your interface language to a small relay (a Cloudflare Worker run by the developer) that creates an issue in the public GitHub repository [thomas783/pr-docent](https://github.com/thomas783/pr-docent/issues). **That issue is public**, so don't include private code or personal information. The relay uses your IP address only briefly to limit how often feedback can be sent and does not store it.
- **Your local Claude Code, only when you ask.** When you click "Create a tour with local Claude Code", "Make a short" or "Save as a video file", the extension hands the pull request's diff, changed files, title and description to the PR Docent local helper on your computer (installed with `npx pr-docent install`). The helper runs Claude Code, which you installed and signed in to yourself; Claude Code sends that content to Anthropic under your own account and Anthropic's terms, as it does whenever you use it. Without the local helper, this never happens.
- **Narration** uses the speech voices built into your browser and operating system.

## What it doesn't do

It doesn't sell or transfer data to third parties for any other purpose, use it for advertising or credit decisions, or read pages other than github.com.

## Contact

Questions: open an issue at https://github.com/thomas783/pr-docent/issues.

---

# PR Docent 개인정보 처리방침

[English](#pr-docent-privacy-policy) | **한국어**

최종 수정일: 2026-11-02

PR Docent는 GitHub 풀 리퀘스트에서 리뷰 투어를 재생하는 Chrome 확장 프로그램입니다. 자체 서버가 없으며, 개발자는 이 확장으로부터 어떤 데이터도 받지 않습니다.

## 읽는 정보

- **사용자가 연 GitHub 페이지.** 풀 리퀘스트 페이지에서 확장은 페이지 내용을 읽고, 사용자의 브라우저 세션으로 github.com, patch-diff.githubusercontent.com, raw.githubusercontent.com에서 해당 PR의 diff, 변경된 파일, 제목, 설명, 코멘트를 가져옵니다. 코멘트에 올라온 투어와 쇼츠를 찾고, 페이지에서 줄을 가리키고, 투어가 PR의 현재 커밋과 맞는지 확인하는 데 씁니다.
- **사용자 설정.** 언어, 음성 해설 사용 여부, 해설 속도입니다.

## 저장하는 정보

사용자 컴퓨터의 Chrome 확장 저장소에만 저장합니다. 설정, PR별로 만든 투어와 쇼츠, 투어에서 마지막으로 본 위치, 저장한 영상 파일의 경로입니다. 확장을 삭제하면 함께 지워집니다.

## 보내는 정보와 받는 곳

- **개발자에게는 사용자가 직접 보내는 피드백 말고는 아무것도 보내지 않습니다.** 분석, 광고, 추적 기능이 없습니다.
- **피드백은 보내기를 눌렀을 때만 보냅니다.** 툴바 팝업의 피드백 양식은 사용자가 입력한 내용, 피드백 종류(버그, 아이디어, 질문), 확장 버전, 화면 언어를 개발자가 운영하는 작은 중계 서버(Cloudflare Worker)로 보내고, 중계 서버가 공개 GitHub 레포 [thomas783/pr-docent](https://github.com/thomas783/pr-docent/issues)에 이슈를 만듭니다. **이 이슈는 공개되므로** 비공개 코드나 개인정보는 넣지 마세요. 중계 서버는 너무 자주 보내지 못하게 하려고 IP 주소를 잠깐 사용하며, 저장하지 않습니다.
- **사용자가 요청할 때만 사용자의 로컬 Claude Code로 보냅니다.** "로컬 Claude Code로 투어 생성", "쇼츠 만들기", "영상 파일로 저장"을 누르면, 확장은 PR의 diff, 변경된 파일, 제목, 설명을 사용자 컴퓨터의 PR Docent 로컬 도우미(`npx pr-docent install`로 설치)에 넘깁니다. 로컬 도우미는 사용자가 직접 설치하고 로그인한 Claude Code를 실행하며, Claude Code는 평소 사용할 때와 마찬가지로 사용자 본인의 계정과 Anthropic 약관에 따라 그 내용을 Anthropic에 보냅니다. 로컬 도우미를 설치하지 않으면 이 과정은 일어나지 않습니다.
- **음성 해설**은 브라우저와 운영체제에 내장된 음성을 사용합니다.

## 하지 않는 일

데이터를 판매하거나 그 밖의 목적으로 제3자에게 넘기지 않고, 광고나 신용 평가에 쓰지 않으며, github.com 이외의 페이지는 읽지 않습니다.

## 문의

https://github.com/thomas783/pr-docent/issues 에 이슈를 남겨 주세요.
