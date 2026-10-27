// Toolbar popup: picks the interface language. Open panels redraw through storage.onChanged.

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
}

select.addEventListener("change", async () => {
  const settings = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] ?? {};
  await chrome.storage.local.set({ [SETTINGS_KEY]: { ...settings, language: select.value } });
  render();
});

render();
