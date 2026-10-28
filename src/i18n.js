// Interface text in English (the default) and Korean. Chrome's own chrome.i18n always follows
// the browser's language, so the extension keeps its own dictionaries and lets people pick a
// language in the toolbar popup. Pure — no DOM, no chrome.*.

export const LANGUAGES = ["auto", "en", "ko"];

const MESSAGES = {
  en: {
    level_focus: "Focus",
    level_skim: "Skim",
    level_skip: "Skippable",
    reviewPoint: "Review point",
    savedTourInvalid: "Couldn't read the saved tour: {0}",
    notJson: "This file isn't JSON.",
    readingPr: "Reading the pull request…",
    fetchingFiles: "Fetching the diff and changed files…",
    writingTour: "Claude Code is writing the tour… {0}s",
    hostMissing: "The local helper isn't installed. Run npx pr-docent install, then reload the extension.",
    generateFailed: "Couldn't create the tour: {0}",
    generationStopped: "Generation stopped.",
    headNotFound: "Couldn't find the pull request's latest commit.",
    prPageFailed: "Couldn't read the pull request page ({0}).",
    tourFormatErrors: "Tour format errors ({0}): {1}",
    tourForOtherPr: "This tour is for {0}. File paths may not match.",
    fileNotOnPage: "This file isn't on the page. The tour may be for another version of the pull request.",
    linesNotFound: "Couldn't find those lines, so this jumped to the file.",
    noTour: "No tour for this pull request yet. Create one with your local Claude Code or load a tour JSON file.",
    untitledTour: "Tour",
    generate: "Create a tour with local Claude Code",
    regenerate: "↻ Regenerate with local Claude Code",
    prSummary: "Pull request summary",
    stepOf: "Step {0} of {1}",
    previous: "◀ Previous",
    play: "▶ Play",
    pause: "❚❚ Pause",
    next: "Next ▶",
    previousFocus: "⏮ Previous focus",
    nextFocus: "Next focus ⏭",
    narration: "Narration",
    uncoveredFiles: "⚠ {0} files the tour doesn't cover",
    skippedFiles: "{0} skipped files",
    shortcuts: "Shortcuts",
    loadJson: "Load tour JSON",
    close: "Close",
    onlyOnChanges: "Tours run on the {0} tab.",
    shortcutStep: "Next / previous step",
    shortcutFocus: "Next / previous focus step",
    shortcutPlay: "Play / pause",
    popupLanguage: "Language",
    language_auto: "Automatic (browser)",
    language_en: "English",
    language_ko: "한국어",
    popupHint: "Open a pull request's Files changed tab and click ▶ PR Docent.",
    shortScript: "Claude Code is writing the short… {0}s",
    shortRender: "Saving the video file… {0}",
    shortFailed: "Couldn't make the short: {0}",
    showInFinder: "Show in Finder",
    makeShort: "🎬 Make a short",
    remakeShort: "🎬 Make the short again",
    watchShort: "🎬 Watch the short",
    saveVideo: "Save as a video file (macOS)",
    videoSaved: "Saved {0} in Downloads.",
    more: "More",
    whereAt: "Chapter {0}/{1} · step {2}/{3}",
    voiceOn: "Narration on",
    voiceOff: "Narration off",
    reloadPage: "PR Docent was updated. Reload this page to use it.",
  },
  ko: {
    level_focus: "집중",
    level_skim: "훑기",
    level_skip: "생략 가능",
    reviewPoint: "리뷰 포인트",
    savedTourInvalid: "저장된 투어를 읽지 못했습니다: {0}",
    notJson: "JSON 형식이 아닙니다.",
    readingPr: "PR 정보를 가져오는 중…",
    fetchingFiles: "diff와 바뀐 파일을 가져오는 중…",
    writingTour: "Claude Code가 투어를 작성하는 중… {0}초",
    hostMissing: "로컬 도우미가 설치되어 있지 않습니다. npx pr-docent install을 실행한 뒤 확장을 새로고침하세요.",
    generateFailed: "투어를 만들지 못했습니다: {0}",
    generationStopped: "생성이 중단되었습니다.",
    headNotFound: "PR의 최신 커밋을 찾지 못했습니다.",
    prPageFailed: "PR 페이지를 읽지 못했습니다 ({0}).",
    tourFormatErrors: "투어 형식 오류 {0}건: {1}",
    tourForOtherPr: "이 투어는 {0}용입니다. 파일 경로가 맞지 않을 수 있습니다.",
    fileNotOnPage: "이 파일이 페이지에 없습니다. 투어가 다른 버전의 PR용일 수 있습니다.",
    linesNotFound: "해당 줄을 찾지 못해 파일 위치로 이동했습니다.",
    noTour: "이 PR의 투어가 없습니다. 로컬 Claude Code로 만들거나 투어 JSON 파일을 불러오세요.",
    untitledTour: "투어",
    generate: "로컬 Claude Code로 투어 생성",
    regenerate: "↻ 로컬 Claude Code로 다시 생성",
    prSummary: "PR 요약",
    stepOf: "{0} / {1} 단계",
    previous: "◀ 이전",
    play: "▶ 재생",
    pause: "❚❚ 일시정지",
    next: "다음 ▶",
    previousFocus: "⏮ 이전 집중",
    nextFocus: "다음 집중 ⏭",
    narration: "음성 안내",
    uncoveredFiles: "⚠ 투어가 다루지 않은 파일 {0}개",
    skippedFiles: "건너뛴 파일 {0}개",
    shortcuts: "단축키",
    loadJson: "투어 JSON 불러오기",
    close: "닫기",
    onlyOnChanges: "투어는 {0} 탭에서 동작합니다.",
    shortcutStep: "다음 / 이전 단계",
    shortcutFocus: "다음 / 이전 집중 단계",
    shortcutPlay: "재생 / 일시정지",
    popupLanguage: "언어",
    language_auto: "자동 (브라우저 언어)",
    language_en: "English",
    language_ko: "한국어",
    popupHint: "PR의 Files changed 탭에서 ▶ PR Docent를 누르세요.",
    shortScript: "Claude Code가 쇼츠 대본을 쓰는 중… {0}초",
    shortRender: "영상 파일을 만드는 중… {0}",
    shortFailed: "쇼츠를 만들지 못했습니다: {0}",
    showInFinder: "Finder에서 보기",
    makeShort: "🎬 쇼츠 만들기",
    remakeShort: "🎬 쇼츠 다시 만들기",
    watchShort: "🎬 쇼츠 보기",
    saveVideo: "영상 파일로 저장 (macOS)",
    videoSaved: "다운로드 폴더에 {0}을(를) 저장했습니다.",
    more: "더 보기",
    whereAt: "{0}/{1}장 · {2}/{3}단계",
    voiceOn: "음성 안내 켜짐",
    voiceOff: "음성 안내 꺼짐",
    reloadPage: "PR Docent가 업데이트되었습니다. 이 페이지를 새로고침하세요.",
  },
};

/** The language to show: the one picked in the popup, or for "auto" the browser's (English unless Korean). */
export function resolveLanguage(setting, browserLanguage = "") {
  if (setting === "en" || setting === "ko") return setting;
  return String(browserLanguage).toLowerCase().startsWith("ko") ? "ko" : "en";
}

/** Text for [key] in [language], with {0}, {1}… filled from [args]; English when Korean lacks it. */
export function translate(language, key, ...args) {
  const text = MESSAGES[language]?.[key] ?? MESSAGES.en[key] ?? key;
  return text.replace(/{(\d+)}/g, (match, i) => (i in args ? String(args[i]) : match));
}

/** An Error whose text the panel can show in the chosen language (English otherwise). */
export function i18nError(key, ...args) {
  return Object.assign(new Error(translate("en", key, ...args)), { i18n: [key, ...args] });
}

/** Keys of each dictionary, for checking that every language has every message. */
export function messageKeys(language) {
  return Object.keys(MESSAGES[language] ?? {});
}
