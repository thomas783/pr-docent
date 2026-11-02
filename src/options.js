// Settings page: the reviewer's own guidelines for tours generated on their computer. Same format
// as a repository's .github/pr-docent.md; the service worker passes them to the local helper.

import { DEFAULT_LIMITS, PERSONAL_GUIDELINES_KEY, parseGuidelines } from "./guidelines.js";
import { resolveLanguage, translate } from "./i18n.js";

const SETTINGS_KEY = "prdocent:settings";
const textarea = document.getElementById("guidelines");
const status = document.getElementById("status");
let language = "en";

// Shown greyed out while empty, and inserted by "Insert an example": a starting point, never saved
// on its own, since saved text becomes instructions.
const EXAMPLE = {
  en: `---
# Limits (optional). Defaults: ${Object.entries(DEFAULT_LIMITS).map(([key, value]) => `${key} ${value ?? "auto"}`).join(", ")}
maxSteps: 6
sentencesPerStep: 2
---
- Write in English.
- Put test files in the skipped files unless they change behaviour.
- Always add a review point for changes to authentication or payments.`,
  ko: `---
# 상한값(선택). 기본값: ${Object.entries(DEFAULT_LIMITS).map(([key, value]) => `${key} ${value ?? "자동"}`).join(", ")}
maxSteps: 6
sentencesPerStep: 2
---
- 한국어로 써 주세요.
- 동작이 바뀌지 않는 테스트 파일은 건너뛴 파일로 보내 주세요.
- 인증이나 결제 관련 변경에는 항상 리뷰 포인트를 달아 주세요.`,
};

async function render() {
  const settings = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] ?? {};
  language = resolveLanguage(settings.language ?? "auto", navigator.language);
  document.documentElement.lang = language;
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = translate(language, el.dataset.i18n)));
  textarea.placeholder = EXAMPLE[language];
  textarea.value = (await chrome.storage.local.get(PERSONAL_GUIDELINES_KEY))[PERSONAL_GUIDELINES_KEY] ?? "";
}

function show(message, isError = false) {
  status.textContent = message;
  status.className = isError ? "error" : "";
}

document.getElementById("save").addEventListener("click", async () => {
  // The same check the local helper makes, so a mistake shows up now rather than at generation.
  const { errors } = parseGuidelines(textarea.value);
  if (errors.length) return show(errors.join(" / "), true);
  await chrome.storage.local.set({ [PERSONAL_GUIDELINES_KEY]: textarea.value });
  show(translate(language, textarea.value.trim() ? "guidelinesSaved" : "guidelinesCleared"));
});

document.getElementById("example").addEventListener("click", () => {
  // Inserting the example over the reviewer's own text would lose it: only into an empty box.
  if (textarea.value.trim()) return show(translate(language, "guidelinesExampleNotEmpty"), true);
  textarea.value = EXAMPLE[language];
  textarea.focus();
  show(translate(language, "guidelinesExampleInserted"));
});

render();
