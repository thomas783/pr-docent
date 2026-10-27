// The tour panel: a floating launcher plus a side panel rendered in a shadow root, so
// GitHub's CSS and ours never collide. It owns playback: focusing steps on the page,
// narrating them, and advancing while playing.

import { clearHighlight, emphasize, fetchCommentTour, fetchPullRequestDetails, focusStep, listPullRequestFiles, parsePullRequestPath } from "./github.js";
import { generateLocally, makeShort, revealFile } from "./generate.js";
import { resolveLanguage, translate } from "./i18n.js";
import { Player } from "./player.js";
import { actionForKey, SHORTCUT_HELP } from "./shortcuts.js";
import { speak, speechAvailable, spokenIndex, stopSpeaking } from "./speech.js";
import { narrationUnits, parseTour, tourFileName, tourLanguage, uncoveredFiles } from "./tour.js";

const PANEL_WIDTH = 360;
const SETTINGS_KEY = "prdocent:settings";
const SPEECH_LOCALES = { ko: "ko-KR", en: "en-US" };

export class TourPanel {
  constructor(pr) {
    this.pr = pr;
    this.key = `${pr.owner}/${pr.repo}/${pr.number}`;
    this.player = null;
    this.settings = { voice: speechAvailable(), rate: 1, language: "auto" };
    this.narrationToken = 0;
    this.status = "";
    this.generating = null; // progress text while the local generator runs
    this.shorting = null; // progress text while a short is rendered
    this.shortPath = null; // the last video made for this PR
    this.host = document.createElement("div");
    this.host.id = "prdocent-root";
    this.root = this.host.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${STYLES}</style><button class="launcher" title="PR Docent">▶ PR Docent</button><aside class="panel" hidden></aside>`;
    this.launcher = this.root.querySelector(".launcher");
    this.panel = this.root.querySelector(".panel");
    this.unitIndex = 0;
    this.launcher.addEventListener("click", () => this.toggleOpen());
    this.onKeyDown = (event) => this.handleShortcut(event);
    document.addEventListener("keydown", this.onKeyDown, true);
    // The toolbar popup changes the language; redraw in it right away.
    this.onStorageChange = (changes) => {
      if (!changes[SETTINGS_KEY]) return;
      this.settings = { ...this.settings, ...changes[SETTINGS_KEY].newValue };
      this.render();
    };
    chrome.storage?.onChanged.addListener(this.onStorageChange);
    document.body.append(this.host);
  }

  /** Interface text in the language picked in the popup (or the browser's). */
  t(key, ...args) {
    return translate(resolveLanguage(this.settings.language, navigator.language), key, ...args);
  }

  errorText(error) {
    return error.i18n ? this.t(...error.i18n) : error.message;
  }

  handleShortcut(event) {
    if (this.panel.hidden || !this.player) return;
    const action = actionForKey(event);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    this.player[action]();
  }

  async toggleOpen() {
    const opening = this.panel.hidden;
    this.panel.hidden = !opening;
    this.launcher.classList.toggle("active", opening);
    reservePageSpace(opening);
    if (!opening) {
      this.stop();
      return clearHighlight();
    }
    if (!this.player) await this.load();
    this.render();
    if (this.player) {
      await this.focusCurrent();
      this.render();
    }
  }

  destroy() {
    document.removeEventListener("keydown", this.onKeyDown, true);
    chrome.storage?.onChanged.removeListener(this.onStorageChange);
    this.stop();
    clearHighlight();
    reservePageSpace(false);
    this.host.remove();
  }

  /* ---------------- loading ---------------- */

  async load() {
    this.settings = { ...this.settings, ...(await storageGet(SETTINGS_KEY)) };
    this.shortPath = (await storageGet(`prdocent:short:${this.key}`)) ?? null;
    const stored = await storageGet(`prdocent:tour:${this.key}`);
    // A tour loaded by hand wins, then one the generate-tour workflow posted, then a bundled example.
    const raw = stored ?? (await fetchCommentTour(this.pr)) ?? (await fetchBundledTour(this.pr));
    if (!raw) return;
    const { tour, errors } = parseTour(raw);
    if (errors.length) {
      this.status = this.t("savedTourInvalid", errors[0]);
      return;
    }
    this.start(tour, (await storageGet(`prdocent:pos:${this.key}`)) ?? 0);
  }

  async loadFromFile(file) {
    let raw;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      this.status = this.t("notJson");
      return this.render();
    }
    await this.useTour(raw);
  }

  /** Has the user's local Claude Code write a tour for this PR, then plays it. */
  async generate() {
    if (this.generating) return;
    this.generating = this.t("readingPr");
    this.status = "";
    this.render();
    try {
      const details = await fetchPullRequestDetails(this.pr);
      // Write the tour in the interface language.
      const language = resolveLanguage(this.settings.language, navigator.language) === "ko" ? "한국어" : "English";
      const raw = await generateLocally({ pr: this.pr, ...details, language }, (progress) => {
        this.generating = progress.stage === "fetch"
          ? this.t("fetchingFiles")
          : this.t("writingTour", progress.seconds ?? 0);
        this.render();
      });
      this.generating = null;
      await this.useTour(raw);
      await this.focusCurrent();
      this.render();
    } catch (error) {
      this.generating = null;
      this.status = error.notInstalled ? this.t("hostMissing") : this.t("generateFailed", this.errorText(error));
      this.render();
    }
  }

  /** Has the local host turn this tour into a short video (MP4 in Downloads). */
  async makeShort() {
    if (this.shorting || this.generating || !this.player) return;
    this.shorting = this.t("readingPr");
    this.shortPath = null;
    this.status = "";
    this.render();
    try {
      const details = await fetchPullRequestDetails(this.pr);
      const language = tourLanguage(this.player.tour) === "ko" ? "한국어" : "English";
      this.shortPath = await makeShort({ pr: this.pr, ...details, tour: this.player.tour, language }, (progress) => {
        this.shorting = progress.stage === "fetch"
          ? this.t("fetchingFiles")
          : progress.stage === "render"
            ? this.t("shortRender", progress.detail ?? "")
            : this.t("shortScript", progress.seconds ?? 0);
        this.render();
      });
      await storageSet(`prdocent:short:${this.key}`, this.shortPath);
    } catch (error) {
      this.status = error.notInstalled ? this.t("hostMissing") : this.t("shortFailed", this.errorText(error));
    }
    this.shorting = null;
    this.render();
  }

  /** Plays a finished short over the page in the extension's own player page. */
  playVideo(path) {
    this.root.querySelector(".video-overlay")?.remove();
    const overlay = document.createElement("div");
    overlay.className = "video-overlay";
    overlay.innerHTML = `<div class="video-box"><iframe allow="autoplay; fullscreen" src="${esc(chrome.runtime.getURL(`player.html?path=${encodeURIComponent(path)}`))}"></iframe>
      <button class="video-close" aria-label="${esc(this.t("close"))}">✕</button></div>`;
    const close = () => overlay.remove();
    overlay.addEventListener("click", (event) => event.target === overlay && close());
    overlay.querySelector(".video-close").addEventListener("click", close);
    this.root.append(overlay);
  }

  /** Validates [raw], saves it for this PR and starts it from the first step. */
  async useTour(raw) {
    const { tour, errors } = parseTour(raw);
    if (errors.length) {
      this.status = this.t("tourFormatErrors", errors.length, errors.slice(0, 3).join(" / "));
      return this.render();
    }
    const { owner, repo, number } = tour.pr;
    this.status = owner === this.pr.owner && repo === this.pr.repo && number === this.pr.number
      ? ""
      : this.t("tourForOtherPr", `${owner}/${repo}#${number}`);
    await storageSet(`prdocent:tour:${this.key}`, raw);
    this.stop();
    this.start(tour, 0);
    this.render();
  }

  start(tour, position) {
    this.player = new Player(tour, { startAt: position });
    this.player.onChange((reason) => this.onPlayerChange(reason));
  }

  /* ---------------- playback ---------------- */

  async onPlayerChange(reason) {
    if (reason === "step") {
      storageSet(`prdocent:pos:${this.key}`, this.player.index);
      await this.focusCurrent();
    }
    if (reason === "pause") {
      this.narrationToken++;
      stopSpeaking();
    }
    this.render();
    if (this.player.playing && (reason === "step" || reason === "play")) this.narrate();
  }

  async focusCurrent() {
    const result = await focusStep(this.player.current);
    this.status = result.found === "none"
      ? this.t("fileNotOnPage")
      : result.found === "file" && this.player.current.lines
        ? this.t("linesNotFound")
        : "";
  }

  /**
   * Reads the step one sentence at a time, pointing at the lines each sentence talks about.
   * [from] says where to start ({ unit, char }), used to resume mid-step after a rate change.
   */
  async narrate(from = { unit: 0, char: 0 }) {
    const token = ++this.narrationToken;
    const step = this.player.current;
    // Narrate in the tour's own language, whatever language the interface is in.
    const language = tourLanguage(this.player.tour);
    const units = narrationUnits(step, {
      chapterTitle: this.player.startsChapter ? step.chapterTitle : "",
      pointLabel: translate(language, "reviewPoint"),
    });
    for (let i = from.unit; i < units.length; i++) {
      this.unitIndex = i;
      const { text, lines } = units[i];
      const offset = i === from.unit ? from.char : 0;
      await emphasize(step, lines);
      if (token !== this.narrationToken) return;
      if (this.settings.voice) {
        await speak(text, { lang: SPEECH_LOCALES[language], rate: this.settings.rate, from: offset });
      } else {
        await sleep((Math.max(1.5, text.slice(offset).length / 12) * 1000) / this.settings.rate);
      }
      if (token !== this.narrationToken) return;
    }
    if (this.player.playing) this.player.next();
  }

  stop() {
    this.narrationToken++;
    stopSpeaking();
    this.player?.pause();
  }

  /* ---------------- rendering ---------------- */

  render() {
    if (this.panel.hidden) return;
    if (!this.player) {
      this.panel.innerHTML = `
        ${this.header()}
        <p class="muted">${esc(this.t("noTour"))}</p>
        ${this.generateButton()}
        ${this.fileInput()}
        ${this.status ? `<p class="status">${esc(this.status)}</p>` : ""}`;
      return this.bind();
    }
    const { tour } = this.player;
    const step = this.player.current;
    const total = this.player.steps.length;
    const uncovered = uncoveredFiles(tour, listPullRequestFiles());

    this.panel.innerHTML = `
      ${this.header()}
      <h2>${esc(tour.title || this.t("untitledTour"))}</h2>
      ${this.generateButton(this.t("regenerate"), "compact")}
      <button class="generate compact" data-action="short" ${this.shorting || this.generating ? "disabled" : ""}>${esc(this.shorting ?? this.t("makeShort"))}</button>
      ${this.shortPath ? `<p class="saved"><button class="generate compact play" data-action="play">${esc(this.t("playShort"))}</button> ${esc(this.t("shortSaved", this.shortPath.split("/").pop()))} <button class="link" data-action="reveal">${esc(this.t("showInFinder"))}</button></p>` : ""}
      ${tour.summary ? `<details><summary>${esc(this.t("prSummary"))}</summary><p>${esc(tour.summary)}</p></details>` : ""}
      <div class="progress"><span style="width:${((this.player.index + 1) / total) * 100}%"></span></div>
      <p class="muted">${esc(this.t("stepOf", this.player.index + 1, total))}</p>

      <section class="step">
        <p class="chapter">${esc(step.chapterTitle)}</p>
        <p class="file" title="${esc(step.file)}" data-action="refocus">${esc(step.file)}${step.lines ? `<span>:${step.lines[0]}-${step.lines[1]}</span>` : ""}</p>
        <span class="level ${step.level}">${esc(this.t(`level_${step.level}`))}</span>
        <p class="note">${esc(step.note)}</p>
        ${step.point ? `<p class="point"><b>${esc(this.t("reviewPoint"))}</b>${esc(step.point)}</p>` : ""}
        ${this.status ? `<p class="status">${esc(this.status)}</p>` : ""}
      </section>

      <div class="controls">
        <button data-action="prev" ${this.player.isFirst ? "disabled" : ""}>${esc(this.t("previous"))}</button>
        <button class="primary" data-action="toggle">${esc(this.t(this.player.playing ? "pause" : "play"))}</button>
        <button data-action="next" ${this.player.isLast ? "disabled" : ""}>${esc(this.t("next"))}</button>
      </div>
      <div class="controls focus-nav">
        <button data-action="previousFocus" ${this.player.findFocus(-1) < 0 ? "disabled" : ""}>${esc(this.t("previousFocus"))}</button>
        <button data-action="nextFocus" ${this.player.findFocus(1) < 0 ? "disabled" : ""}>${esc(this.t("nextFocus"))}</button>
      </div>
      <div class="settings">
        <label><input type="checkbox" data-action="voice" ${this.settings.voice ? "checked" : ""} ${speechAvailable() ? "" : "disabled"}> ${esc(this.t("narration"))}</label>
        <select data-action="rate">${[0.8, 1, 1.25, 1.5].map((r) => `<option value="${r}" ${r === this.settings.rate ? "selected" : ""}>${r}x</option>`).join("")}</select>
      </div>

      <h3>${esc(this.t("chapters"))}</h3>
      <ol class="chapters">
        ${tour.chapters.map((c, i) => `<li class="${i === step.chapterIndex ? "current" : ""}" data-chapter="${i}"><b>${esc(c.title)}</b>${c.summary ? `<small>${esc(c.summary)}</small>` : ""}</li>`).join("")}
      </ol>

      ${uncovered.length ? `<details class="uncovered"><summary>${esc(this.t("uncoveredFiles", uncovered.length))}</summary><ul>${uncovered.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></details>` : ""}
      ${tour.skipped.length ? `<details><summary>${esc(this.t("skippedFiles", tour.skipped.length))}</summary><ul>${tour.skipped.map((s) => `<li>${esc(s.file)}<small>${esc(s.reason)}</small></li>`).join("")}</ul></details>` : ""}
      <details><summary>${esc(this.t("shortcuts"))}</summary><dl class="shortcuts">${SHORTCUT_HELP.map(([keys, what]) => `<dt>${esc(keys)}</dt><dd>${esc(this.t(what))}</dd>`).join("")}</dl></details>
      <details><summary>${esc(this.t("loadAnother"))}</summary>${this.fileInput()}</details>`;
    this.bind();
  }

  header() {
    const onDiff = parsePullRequestPath(location.pathname)?.onDiff;
    const { owner, repo, number } = this.pr;
    const link = `<a href="/${esc(owner)}/${esc(repo)}/pull/${number}/changes">Files changed</a>`;
    return `<header><strong>PR Docent</strong><button class="close" data-action="close" aria-label="${esc(this.t("close"))}">✕</button></header>
      ${onDiff ? "" : `<p class="status">${esc(this.t("onlyOnChanges", "{link}")).replace("{link}", link)}</p>`}`;
  }

  generateButton(label = this.t("generate"), variant = "") {
    return `<button class="generate ${variant}" data-action="generate" ${this.generating ? "disabled" : ""}>${esc(this.generating ?? label)}</button>`;
  }

  fileInput() {
    return `<label class="file-input">${esc(this.t("loadJson"))}<input type="file" accept="application/json,.json" data-action="file" hidden></label>`;
  }

  bind() {
    const on = (action, event, handler) =>
      this.panel.querySelectorAll(`[data-action="${action}"]`).forEach((el) => el.addEventListener(event, handler));
    on("close", "click", () => this.toggleOpen());
    on("file", "change", (e) => e.target.files[0] && this.loadFromFile(e.target.files[0]));
    on("generate", "click", () => this.generate());
    on("short", "click", () => this.makeShort());
    on("reveal", "click", () => this.shortPath && revealFile(this.shortPath).catch(() => {}));
    on("play", "click", () => this.shortPath && this.playVideo(this.shortPath));
    if (!this.player) return;
    on("prev", "click", () => this.player.previous());
    on("next", "click", () => this.player.next());
    on("previousFocus", "click", () => this.player.previousFocus());
    on("nextFocus", "click", () => this.player.nextFocus());
    on("toggle", "click", () => this.player.toggle());
    on("refocus", "click", () => this.focusCurrent().then(() => this.render()));
    on("voice", "change", (e) => this.updateSettings({ voice: e.target.checked }));
    on("rate", "change", (e) => this.updateSettings({ rate: Number(e.target.value) }));
    this.panel.querySelectorAll("[data-chapter]").forEach((li) =>
      li.addEventListener("click", () => this.player.goToChapter(Number(li.dataset.chapter))),
    );
  }

  updateSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    storageSet(SETTINGS_KEY, this.settings);
    // An utterance's rate can't change once it has started, so a rate change continues
    // from the word being read with a new utterance. narrate() bumps the token, so the
    // old reading won't advance the step.
    if (!this.settings.voice) stopSpeaking();
    if (this.player?.playing) {
      const char = "rate" in patch && this.settings.voice ? spokenIndex() : 0;
      this.narrate({ unit: this.unitIndex, char });
    }
  }
}

/* ---------------- helpers ---------------- */

/** While the panel is open, narrow the page so the diff isn't hidden behind it. */
function reservePageSpace(on) {
  const id = "prdocent-layout";
  document.getElementById(id)?.remove();
  if (!on) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `body { padding-right: ${PANEL_WIDTH + 32}px !important; }`;
  document.head.append(style);
}

async function fetchBundledTour(pr) {
  try {
    const response = await fetch(chrome.runtime.getURL(`tours/${tourFileName(pr)}`));
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

async function storageGet(key) {
  try {
    return (await chrome.storage.local.get(key))[key];
  } catch {
    return undefined;
  }
}

async function storageSet(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch {
    // storage unavailable (e.g. extension reloaded): the tour still works for this page view
  }
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// GitHub's Primer CSS variables inherit into the shadow root, so the panel follows light/dark mode.
const STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; }
  .launcher {
    position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
    padding: 10px 16px; border-radius: 999px; border: 0; cursor: pointer;
    background: #8250df; color: #fff; font-size: 13px; font-weight: 600;
    box-shadow: 0 6px 20px rgba(0,0,0,.25);
  }
  .launcher.active { background: #6639ba; }
  .panel {
    position: fixed; top: 72px; right: 16px; bottom: 76px; z-index: 2147483000; width: ${PANEL_WIDTH}px; overflow-y: auto;
    padding: 14px 16px; border-radius: 12px;
    background: var(--bgColor-default, #fff); color: var(--fgColor-default, #1f2328);
    border: 1px solid var(--borderColor-default, #d1d9e0); box-shadow: 0 12px 32px rgba(0,0,0,.2);
    font-size: 13px; line-height: 1.5;
  }
  .panel[hidden] { display: none; }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  h2 { font-size: 15px; margin: 4px 0 6px; }
  h3 { font-size: 12px; margin: 16px 0 6px; color: var(--fgColor-muted, #59636e); text-transform: uppercase; letter-spacing: .04em; }
  p { margin: 4px 0; }
  .muted { color: var(--fgColor-muted, #59636e); }
  .status { color: var(--fgColor-attention, #9a6700); }
  a { color: var(--fgColor-accent, #0969da); }
  button, select { font: inherit; }
  .close { border: 0; background: none; cursor: pointer; color: inherit; font-size: 14px; }
  .progress { height: 4px; border-radius: 4px; background: var(--bgColor-muted, #eff2f5); overflow: hidden; margin-top: 8px; }
  .progress span { display: block; height: 100%; background: #8250df; }
  .step { margin-top: 10px; padding: 12px; border-radius: 8px; background: var(--bgColor-muted, #f6f8fa); }
  .chapter { font-weight: 600; }
  .file { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; word-break: break-all; cursor: pointer; color: var(--fgColor-accent, #0969da); }
  .file span { color: var(--fgColor-muted, #59636e); }
  .level { display: inline-block; margin: 4px 0; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .level.focus { background: #ffebe9; color: #a40e26; }
  .level.skim { background: #ddf4ff; color: #0550ae; }
  .level.skip { background: #eff2f5; color: #59636e; }
  .note { white-space: pre-wrap; }
  .point { margin-top: 8px; padding: 8px 10px; border-left: 3px solid #bf8700; border-radius: 6px;
    background: var(--bgColor-attention-muted, #fff8c5); }
  .point b { display: block; font-size: 11px; color: var(--fgColor-attention, #9a6700); }
  .controls { display: flex; gap: 6px; margin-top: 10px; }
  .controls button { flex: 1; padding: 6px; border-radius: 6px; cursor: pointer;
    border: 1px solid var(--borderColor-default, #d1d9e0); background: var(--bgColor-default, #fff); color: inherit; }
  .controls button.primary { background: #8250df; border-color: #8250df; color: #fff; }
  .controls button:disabled { opacity: .4; cursor: default; }
  .focus-nav { margin-top: 6px; }
  .focus-nav button { font-size: 12px; }
  .shortcuts { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 6px 0 0; }
  .shortcuts dt { font-family: ui-monospace, Menlo, monospace; font-size: 11px; }
  .shortcuts dd { margin: 0; color: var(--fgColor-muted, #59636e); }
  .settings { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
  .chapters { margin: 0; padding-left: 20px; }
  .chapters li { padding: 4px 0; cursor: pointer; }
  .chapters li.current b { color: #8250df; }
  .chapters small, ul small { display: block; color: var(--fgColor-muted, #59636e); }
  details { margin-top: 10px; }
  summary { cursor: pointer; font-weight: 600; }
  .uncovered summary { color: var(--fgColor-attention, #9a6700); }
  ul { padding-left: 18px; margin: 6px 0; font-family: ui-monospace, Menlo, monospace; font-size: 11px; word-break: break-all; }
  .generate { display: block; width: 100%; margin-top: 8px; padding: 8px 12px; border-radius: 6px; cursor: pointer;
    border: 0; background: #8250df; color: #fff; font-weight: 600; }
  .generate:disabled { opacity: .7; cursor: default; }
  .saved { font-size: 12px; color: var(--fgColor-success, #1a7f37); }
  .generate.compact.play { margin: 0 6px 0 0; }
  .video-overlay { position: fixed; inset: 0; z-index: 2147483001; background: rgba(1, 4, 9, .72);
    display: flex; align-items: center; justify-content: center; }
  .video-box { position: relative; height: min(88vh, 960px); aspect-ratio: 9 / 16; border-radius: 16px; overflow: hidden;
    box-shadow: 0 24px 64px rgba(0,0,0,.5); background: #0d1117; }
  .video-box iframe { width: 100%; height: 100%; border: 0; }
  .video-close { position: absolute; top: 10px; right: 10px; width: 32px; height: 32px; border-radius: 50%; border: 0;
    background: rgba(0,0,0,.55); color: #fff; font-size: 15px; cursor: pointer; }
  .link { border: 0; background: none; padding: 0; color: var(--fgColor-accent, #0969da); cursor: pointer; text-decoration: underline; font-size: 12px; }
  .generate.compact { display: inline-block; width: auto; margin: 0 0 4px; padding: 3px 10px; font-size: 12px; font-weight: 500;
    border: 1px solid #8250df; background: transparent; color: #8250df; }
  .file-input { display: inline-block; margin-top: 8px; padding: 6px 12px; border-radius: 6px; cursor: pointer;
    border: 1px solid var(--borderColor-default, #d1d9e0); }
`;
