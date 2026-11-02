// Toolbar popup: picks the interface language (open panels redraw through storage.onChanged) and
// sends feedback, which the relay turns into a public GitHub issue.

import { sendFeedback } from "./feedback.js";
import { LANGUAGES, resolveLanguage, translate } from "./i18n.js";

const SETTINGS_KEY = "prdocent:settings";
const select = document.getElementById("language");

async function render() {
  const settings = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] ?? {};
  const current = settings.language ?? "auto";
  const language = resolveLanguage(current, navigator.language);
  document.documentElement.lang = language;
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = translate(language, el.dataset.i18n)));
  select.innerHTML = LANGUAGES.map((code) => `<option value="${code}">${translate(language, `language_${code}`)}</option>`).join("");
  select.value = current;
  document.getElementById("feedback-text").placeholder = translate(language, "feedbackPlaceholder");
  return language;
}

const FEEDBACK_ERRORS = { "too-short": "feedbackTooShort", "too-long": "feedbackTooLong", "rate-limited": "feedbackRateLimited", network: "feedbackNetwork" };

document.getElementById("feedback-send").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const status = document.getElementById("feedback-status");
  const text = document.getElementById("feedback-text");
  const language = await render();
  button.disabled = true;
  status.textContent = translate(language, "feedbackSending");
  try {
    const url = await sendFeedback({ type: document.querySelector('input[name="type"]:checked').value, message: text.value, lang: language });
    text.value = "";
    status.replaceChildren(Object.assign(document.createElement("a"), { href: url, target: "_blank", rel: "noopener", textContent: translate(language, "feedbackSent") }));
  } catch (error) {
    status.textContent = translate(language, FEEDBACK_ERRORS[error.message] ?? "feedbackFailed");
  }
  button.disabled = false;
});

select.addEventListener("change", async () => {
  const settings = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] ?? {};
  await chrome.storage.local.set({ [SETTINGS_KEY]: { ...settings, language: select.value } });
  render();
});

render().then(() => {
  // Opened from the panel's "Send feedback": start typing right away.
  if (location.hash === "#feedback") document.getElementById("feedback-text").focus();
});
