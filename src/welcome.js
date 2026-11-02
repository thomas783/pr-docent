// Opened once, right after installing: what PR Docent does and the demo pull request to try it on.

import { resolveLanguage, translate } from "./i18n.js";
import { DEMO_PULLS, GUIDES } from "./links.js";

const settings = (await chrome.storage.local.get("prdocent:settings"))["prdocent:settings"] ?? {};
const language = resolveLanguage(settings.language ?? "auto", navigator.language);
document.documentElement.lang = language;
document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = translate(language, el.dataset.i18n)));
document.getElementById("demo").href = DEMO_PULLS[language];
document.getElementById("actions-guide").href = GUIDES[language].actions;
document.getElementById("local-guide").href = GUIDES[language].local;
