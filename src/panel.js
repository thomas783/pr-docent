// The tour panel: a floating launcher plus a side panel rendered in a shadow root, so
// GitHub's CSS and ours never collide. It owns playback: focusing steps on the page,
// narrating them, and advancing while playing.

import { clearHighlight, emphasize, fetchCommentData, fetchPullRequestDetails, fetchPullRequestRevision, focusStep, listPullRequestFiles, parsePullRequestPath } from "./github.js";
import { generateLocally, revealFile, saveShortVideo, writeShortScript } from "./generate.js";
import { resolveLanguage, translate } from "./i18n.js";
import { svg } from "./icons.js";
import { Player } from "./player.js";
import { actionForKey, SHORTCUT_HELP } from "./shortcuts.js";
import { speak, speechAvailable, spokenIndex, stopSpeaking } from "./speech.js";
import { narrationUnits, parseTour, pickTour, tourFileName, tourFreshness, tourLanguage, uncoveredFiles } from "./tour.js";

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
    this.shorting = null; // progress text while a short is written or saved as a video
    this.short = null; // this PR's short script: made here, or posted with the tour
    this.videoPath = null; // the last MP4 saved from it
    this.menuOpen = false;
    this.summaryOpen = false;
    this.chaptersOpen = false;
    this.host = document.createElement("div");
    this.host.id = "prdocent-root";
    this.root = this.host.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${STYLES}</style><button class="launcher" title="PR Docent">${svg("play", 12)} PR Docent</button><aside class="panel" hidden></aside><div class="tip" hidden></div>`;
    this.launcher = this.root.querySelector(".launcher");
    this.panel = this.root.querySelector(".panel");
    this.showTips();
    this.unitIndex = 0;
    // Files marked as Viewed that the reviewer chose to open anyway.
    this.openedViewed = new Set();
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
    // Reopen after a full page load (a reload, or a link GitHub didn't route) if it was open.
    if (sessionGet(this.openKey)) this.toggleOpen();
  }

  get openKey() {
    return `prdocent:open:${this.key}`;
  }

  /** Interface text in the language picked in the popup (or the browser's). */
  t(key, ...args) {
    return translate(resolveLanguage(this.settings.language, navigator.language), key, ...args);
  }

  errorText(error) {
    return error.i18n ? this.t(...error.i18n) : error.message;
  }

  /**
   * False, with a note to reload, when the extension was reloaded after this page opened: the
   * page keeps this script, but every chrome.* call fails with "Extension context invalidated".
   */
  connected() {
    if (chrome.runtime?.id) return true;
    this.menuOpen = false;
    this.status = this.t("reloadPage");
    this.render();
    return false;
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
    sessionSet(this.openKey, opening);
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

  /**
   * The user moved between this PR's tabs. Highlights only make sense on Files changed (the
   * Conversation tab has diff snippets too, which they would dim), so drop them elsewhere and
   * put the current step back on return.
   */
  async tabChanged(onDiff) {
    if (!onDiff) {
      this.stop();
      clearHighlight();
    } else if (!this.panel.hidden && this.player) {
      await this.focusCurrent();
    }
    this.render();
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
    if (!chrome.runtime?.id) {
      this.status = this.t("reloadPage"); // see connected()
      return;
    }
    this.settings = { ...this.settings, ...(await storageGet(SETTINGS_KEY)) };
    this.videoPath = (await storageGet(`prdocent:video:${this.key}`)) ?? null;
    const stored = await storageGet(`prdocent:tour:${this.key}`);
    const [posted, revision] = await Promise.all([fetchCommentData(this.pr), fetchPullRequestRevision(this.pr).catch(() => null)]);
    this.revision = revision;
    this.short = (await storageGet(`prdocent:shortscript:${this.key}`)) ?? posted.short;
    // The tour made here, or the one the generate-tour workflow posted when only that one matches
    // the PR's current commits, then a bundled example.
    const raw = pickTour(stored, posted.tour, revision) ?? (await fetchBundledTour(this.pr));
    if (!raw) return;
    const { tour, errors } = parseTour(raw);
    if (errors.length) {
      this.status = this.t("savedTourInvalid", errors[0]);
      return;
    }
    this.start(tour, (await storageGet(`prdocent:pos:${this.key}`)) ?? 0);
  }

  /** Has the user's local Claude Code write a tour for this PR, then plays it. */
  async generate() {
    if (this.generating || !this.connected()) return;
    this.menuOpen = false;
    this.generating = this.t("readingPr");
    this.status = "";
    this.render();
    try {
      const details = await fetchPullRequestDetails(this.pr);
      // The commits this tour is made for, read before the diff so a push meanwhile shows as newer.
      const revision = await fetchPullRequestRevision(this.pr).catch(() => null);
      // Write the tour in the interface language.
      const language = resolveLanguage(this.settings.language, navigator.language) === "ko" ? "한국어" : "English";
      const raw = await generateLocally({ pr: this.pr, ...details, language }, (progress) => {
        this.generating = progress.stage === "fetch"
          ? this.t("fetchingFiles")
          : this.t("writingTour", progress.seconds ?? 0);
        this.render();
      });
      if (revision) {
        raw.pr = { ...raw.pr, head: revision.head, base: revision.base };
        this.revision = revision;
      }
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

  /** Has the user's local Claude Code write a short script from this tour, then plays it. */
  async makeShort() {
    if (this.shorting || this.generating || !this.player || !this.connected()) return;
    this.menuOpen = false;
    this.shorting = this.t("readingPr");
    this.status = "";
    this.render();
    try {
      const details = await fetchPullRequestDetails(this.pr);
      const language = tourLanguage(this.player.tour) === "ko" ? "한국어" : "English";
      this.short = await writeShortScript({ pr: this.pr, ...details, tour: this.player.tour, language }, (progress) => {
        this.shorting = progress.stage === "fetch" ? this.t("fetchingFiles") : this.t("shortScript", progress.seconds ?? 0);
        this.render();
      });
      await storageSet(`prdocent:shortscript:${this.key}`, this.short);
      // A video file saved earlier is of the old short.
      this.videoPath = null;
      await storageSet(`prdocent:video:${this.key}`, null);
      this.shorting = null;
      this.render();
      this.playShort();
    } catch (error) {
      this.shorting = null;
      this.status = error.notInstalled ? this.t("hostMissing") : this.t("shortFailed", this.errorText(error));
      this.render();
    }
  }

  /** Saves the short as an MP4 in Downloads with the local host (macOS), for sharing as a file. */
  async saveVideo() {
    if (this.shorting || !this.short || !this.connected()) return;
    this.menuOpen = false;
    this.shorting = this.t("shortRender", "");
    this.status = "";
    this.render();
    try {
      this.videoPath = await saveShortVideo(this.short, (progress) => {
        this.shorting = this.t("shortRender", progress.detail ?? "");
        this.render();
      });
      await storageSet(`prdocent:video:${this.key}`, this.videoPath);
      this.status = this.t("videoSaved", this.videoPath.split("/").pop());
    } catch (error) {
      this.status = error.notInstalled ? this.t("hostMissing") : this.t("shortFailed", this.errorText(error));
    }
    this.shorting = null;
    this.render();
  }

  /** Plays the short live over the page, in the extension's own player page. */
  async playShort() {
    if (!this.short || !this.connected()) return;
    await storageSet("prdocent:play", this.short);
    this.root.querySelector(".video-overlay")?.remove();
    const overlay = document.createElement("div");
    overlay.className = "video-overlay";
    overlay.innerHTML = `<div class="video-box"><iframe allow="autoplay; fullscreen" src="${esc(chrome.runtime.getURL("player.html?short=prdocent:play"))}"></iframe>
      <button class="video-close" aria-label="${esc(this.t("close"))}">${svg("close")}</button></div>`;
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
    this.menuOpen = false;
    this.stop();
    this.start(tour, 0);
    this.render();
  }

  start(tour, position) {
    this.freshness = tourFreshness(tour.pr, this.revision);
    this.player = new Player(tour, { startAt: position });
    this.player.onChange((reason) => this.onPlayerChange(reason));
  }

  /* ---------------- playback ---------------- */

  /** The current step is in a file marked as Viewed: ask before opening and reading it. */
  get askingViewed() {
    return this.focusResult === "viewed";
  }

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
    if (this.player.playing && (reason === "step" || reason === "play") && !this.askingViewed) this.narrate();
  }

  async focusCurrent() {
    const result = await focusStep(this.player.current, { openViewed: this.openedViewed.has(this.player.current.file) });
    this.focusResult = result.found;
    this.status = result.found === "viewed" ? "" : result.found === "none"
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
    // Re-rendering replaces the markup; keep the reader's place in the scrolling middle part.
    const scrolled = this.panel.querySelector(".content")?.scrollTop ?? 0;
    this.draw();
    const content = this.panel.querySelector(".content");
    if (content) content.scrollTop = scrolled;
  }

  draw() {
    if (!this.player) {
      this.panel.innerHTML = `
        ${this.header()}
        <div class="content">
          <p class="muted">${esc(this.t("noTour"))}</p>
          ${this.generateButton()}
          ${this.status ? `<p class="status">${esc(this.status)}</p>` : ""}
        </div>`;
      return this.bind();
    }
    const { tour } = this.player;
    const step = this.player.current;
    const total = this.player.steps.length;
    const uncovered = uncoveredFiles(tour, listPullRequestFiles());
    const icon = (action, glyph, label, disabled = false, cls = "") =>
      `<button class="icon ${cls}" data-action="${action}" data-tip="${esc(label)}" aria-label="${esc(label)}" ${disabled ? "disabled" : ""}>${glyph}</button>`;

    this.panel.innerHTML = `
      ${this.header()}
      ${this.menuOpen ? this.menu(tour) : ""}
      <div class="content">
      <h2 class="title" data-action="summary" data-tip="${esc(this.t("prSummary"))}">${esc(tour.title || this.t("untitledTour"))}</h2>
      ${this.summaryOpen && tour.summary ? `<p class="summary">${esc(tour.summary)}</p>` : ""}
      ${this.freshnessNote()}
      ${this.activity()}

      <section class="step">
        <p class="chapter">${esc(step.chapterTitle)}</p>
        <p class="file" data-tip="${esc(step.file)}" data-action="refocus">${esc(step.file)}${step.lines ? `<span>:${step.lines[0]}-${step.lines[1]}</span>` : ""}
          <span class="level ${step.level}">${esc(this.t(`level_${step.level}`))}</span></p>
        ${this.askingViewed ? `<div class="ask"><p>${esc(this.t("viewedAsk"))}</p>
          <button data-action="openViewed">${esc(this.t("viewedOpen"))}</button>
          <button data-action="skipViewed" ${this.player.isLast ? "disabled" : ""}>${esc(this.t("viewedSkip"))}</button></div>` : ""}
        <p class="note">${esc(step.note)}</p>
        ${step.point ? `<p class="point"><b>${esc(this.t("reviewPoint"))}</b>${esc(step.point)}</p>` : ""}
        ${this.status ? `<p class="status">${esc(this.status)}</p>` : ""}
      </section>
      ${this.chaptersOpen ? `<ol class="chapters">${tour.chapters.map((c, i) => `<li class="${i === step.chapterIndex ? "current" : ""}" data-chapter="${i}"><b>${esc(c.title)}</b>${c.summary ? `<small>${esc(c.summary)}</small>` : ""}</li>`).join("")}</ol>` : ""}
      ${uncovered.length ? `<details class="uncovered"><summary>${esc(this.t("uncoveredFiles", uncovered.length))}</summary><ul>${uncovered.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></details>` : ""}
      </div>

      <div class="footer">
      <div class="bar">
        ${icon("previousFocus", svg("skipBack"), this.t("previousFocus"), this.player.findFocus(-1) < 0)}
        ${icon("prev", svg("prev", 18), this.t("previous"), this.player.isFirst)}
        ${icon("toggle", svg(this.player.playing ? "pause" : "play"), this.t(this.player.playing ? "pause" : "play"), false, "primary")}
        ${icon("next", svg("next", 18), this.t("next"), this.player.isLast)}
        ${icon("nextFocus", svg("skipForward"), this.t("nextFocus"), this.player.findFocus(1) < 0)}
        <span class="spacer"></span>
        ${this.short ? icon("play", svg("video"), this.t("watchShort")) : ""}
        ${icon("voice", svg(this.settings.voice ? "volume" : "mute"), this.t(this.settings.voice ? "voiceOn" : "voiceOff"), !speechAvailable())}
        <select data-action="rate" aria-label="${esc(this.t("narration"))}">${[0.8, 1, 1.25, 1.5].map((r) => `<option value="${r}" ${r === this.settings.rate ? "selected" : ""}>${r}x</option>`).join("")}</select>
      </div>
      <div class="progress"><span style="width:${((this.player.index + 1) / total) * 100}%"></span></div>
      <button class="where" data-action="chapters">${esc(this.t("whereAt", step.chapterIndex + 1, tour.chapters.length, this.player.index + 1, total))} ${svg(this.chaptersOpen ? "up" : "down", 12)}</button>
      </div>`;
    this.bind();
  }

  /** The "More" menu: what people use now and then, out of the way of playback. */
  menu(tour) {
    const item = (action, label) => `<button class="item" data-action="${action}" ${this.generating || this.shorting ? "disabled" : ""}>${esc(label)}</button>`;
    return `<div class="menu">
      ${item("generate", this.t("regenerate"))}
      ${item("short", this.t(this.short ? "remakeShort" : "makeShort"))}
      ${this.short ? item("video", this.t("saveVideo")) : ""}
      ${this.videoPath ? `<button class="item" data-action="reveal">${esc(this.t("showInFinder"))}</button>` : ""}
      ${tour.skipped.length ? `<details><summary>${esc(this.t("skippedFiles", tour.skipped.length))}</summary><ul>${tour.skipped.map((s) => `<li>${esc(s.file)}<small>${esc(s.reason)}</small></li>`).join("")}</ul></details>` : ""}
      <details><summary>${esc(this.t("shortcuts"))}</summary><dl class="shortcuts">${SHORTCUT_HELP.map(([keys, what]) => `<dt>${esc(keys)}</dt><dd>${esc(this.t(what))}</dd>`).join("")}</dl></details>
    </div>`;
  }

  /**
   * Tooltips for [data-tip] elements. The browser's own (title) waits about a second and can't
   * be sped up, so the panel draws its own, kept inside the window.
   */
  showTips() {
    const tip = this.root.querySelector(".tip");
    let timer;
    const hide = () => {
      clearTimeout(timer);
      tip.hidden = true;
    };
    this.panel.addEventListener("pointerover", (event) => {
      const target = event.target.closest("[data-tip]");
      if (!target) return hide();
      clearTimeout(timer);
      // Moving from one control to the next shows the next tip right away.
      timer = setTimeout(() => {
        tip.textContent = target.dataset.tip;
        tip.hidden = false;
        const box = target.getBoundingClientRect();
        const left = Math.min(Math.max(8, box.left + box.width / 2 - tip.offsetWidth / 2), innerWidth - tip.offsetWidth - 8);
        const above = box.top - tip.offsetHeight - 6;
        tip.style.left = `${left}px`;
        tip.style.top = `${above >= 8 ? above : box.bottom + 6}px`;
      }, tip.hidden ? 200 : 0);
    });
    this.panel.addEventListener("pointerleave", hide);
    this.panel.addEventListener("click", hide);
  }

  /** Opens the Viewed file of the current step (and later steps in it) and reads the step. */
  async openViewed() {
    this.openedViewed.add(this.player.current.file);
    await this.focusCurrent();
    this.render();
    if (this.player.playing) this.narrate();
  }

  skipViewed() {
    if (this.player.isLast) return;
    this.player.next();
  }

  /** Says when the tour was made for other commits than the PR has now. */
  freshnessNote() {
    if (!this.freshness || this.freshness === "current") return "";
    if (this.freshness === "unknown") {
      // Only for tours without recorded commits; if the PR couldn't be read, there's nothing to say.
      return this.player.tour.pr.head ? "" : `<p class="muted">${esc(this.t("staleUnknown"))}</p>`;
    }
    return `<div class="stale"><p>${esc(this.t(`stale_${this.freshness}`))}</p>
      <button data-action="generate" ${this.generating ? "disabled" : ""}>${esc(this.t("regenerate"))}</button></div>`;
  }

  /** What the local helper is doing, if anything. */
  activity() {
    const busy = this.generating ?? this.shorting;
    return busy ? `<p class="activity"><span class="spinner"></span>${esc(busy)}</p>` : "";
  }

  header() {
    const { onDiff, onCommits } = parsePullRequestPath(location.pathname) ?? {};
    const { owner, repo, number } = this.pr;
    const link = `<a href="/${esc(owner)}/${esc(repo)}/pull/${number}/changes" data-action="changes">${esc(onCommits ? this.t("allChanges") : "Files changed")}</a>`;
    return `<header><strong>PR Docent</strong><span>
        ${this.player ? `<button class="menu-toggle${this.menuOpen ? " open" : ""}" data-action="menu" aria-expanded="${this.menuOpen}">${esc(this.t("more"))} ${svg(this.menuOpen ? "up" : "down", 12)}</button>` : ""}
        <button class="close" data-action="close" data-tip="${esc(this.t("close"))}" aria-label="${esc(this.t("close"))}">${svg("close")}</button></span></header>
      ${onDiff ? "" : `<p class="status">${esc(this.t(onCommits ? "onlyAllChanges" : "onlyOnChanges", "{link}")).replace("{link}", link)}</p>`}`;
  }

  generateButton(label = this.t("generate"), variant = "") {
    return `<button class="generate ${variant}" data-action="generate" ${this.generating ? "disabled" : ""}>${esc(this.generating ?? label)}</button>`;
  }


  bind() {
    const on = (action, event, handler) =>
      this.panel.querySelectorAll(`[data-action="${action}"]`).forEach((el) => el.addEventListener(event, handler));
    on("close", "click", () => this.toggleOpen());
    on("changes", "click", (event) => {
      // A link inside the panel's shadow root misses GitHub's in-page navigation and reloads the
      // page; click GitHub's own tab instead when it's there.
      const tab = document.querySelector(`a[href$="/pull/${this.pr.number}/changes"], a[href$="/pull/${this.pr.number}/files"]`);
      if (!tab) return;
      event.preventDefault();
      tab.click();
    });
    on("generate", "click", () => this.generate());
    on("short", "click", () => this.makeShort());
    on("video", "click", () => this.saveVideo());
    on("reveal", "click", () => this.videoPath && revealFile(this.videoPath).catch(() => {}));
    on("play", "click", () => this.playShort());
    if (!this.player) return;
    on("menu", "click", () => { this.menuOpen = !this.menuOpen; this.render(); });
    on("summary", "click", () => { this.summaryOpen = !this.summaryOpen; this.render(); });
    on("chapters", "click", () => { this.chaptersOpen = !this.chaptersOpen; this.render(); });
    on("prev", "click", () => this.player.previous());
    on("next", "click", () => this.player.next());
    on("previousFocus", "click", () => this.player.previousFocus());
    on("nextFocus", "click", () => this.player.nextFocus());
    on("toggle", "click", () => this.player.toggle());
    on("openViewed", "click", () => this.openViewed());
    on("skipViewed", "click", () => this.skipViewed());
    on("refocus", "click", () => this.focusCurrent().then(() => this.render()));
    on("voice", "click", () => this.updateSettings({ voice: !this.settings.voice }));
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

/** Per-tab memory that survives reloads (whether the panel was open), never throwing. */
function sessionGet(key) {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function sessionSet(key, on) {
  try {
    if (on) sessionStorage.setItem(key, "1");
    else sessionStorage.removeItem(key);
  } catch {
    // storage blocked: the panel just starts closed
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
  .launcher { display: inline-flex; align-items: center; gap: 6px; }
  .launcher.active { background: #6639ba; }
  .panel {
    position: fixed; top: 72px; right: 16px; bottom: 76px; z-index: 2147483000; width: ${PANEL_WIDTH}px;
    display: flex; flex-direction: column; overflow: hidden;
    padding: 14px 16px; border-radius: 12px;
    background: var(--bgColor-default, #fff); color: var(--fgColor-default, #1f2328);
    border: 1px solid var(--borderColor-default, #d1d9e0); box-shadow: 0 12px 32px rgba(0,0,0,.2);
    font-size: 13px; line-height: 1.5;
  }
  .panel[hidden] { display: none; }
  .tip { position: fixed; z-index: 2147483001; max-width: 280px; padding: 4px 8px; border-radius: 6px; pointer-events: none;
    background: #25292e; color: #fff; font-size: 12px; line-height: 1.4; word-break: break-all; box-shadow: 0 4px 12px rgba(0,0,0,.2); }
  .tip[hidden] { display: none; }
  /* Header on top, controls pinned at the bottom, everything in between scrolls. */
  .content { flex: 1; min-height: 0; overflow-y: auto; margin: 0 -16px; padding: 0 16px; }
  .footer { flex: none; padding-top: 8px; border-top: 1px solid var(--borderColor-muted, #d1d9e0b3); }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  h2 { font-size: 15px; margin: 4px 0 6px; }
  p { margin: 4px 0; }
  .muted { color: var(--fgColor-muted, #59636e); }
  .status { color: var(--fgColor-attention, #9a6700); }
  .ask { margin: 8px 0; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--borderColor-default, #d1d9e0); background: var(--bgColor-default, #fff); }
  .ask p { margin: 0 0 6px; }
  .ask button { margin-right: 6px; padding: 3px 10px; border-radius: 6px; cursor: pointer; color: inherit;
    border: 1px solid var(--borderColor-default, #d1d9e0); background: var(--bgColor-muted, #f6f8fa); }
  .ask button:first-of-type { background: #8250df; border-color: #8250df; color: #fff; }
  .ask button:disabled { opacity: .5; cursor: default; }
  .stale { margin: 6px 0; padding: 8px 10px; border-radius: 6px; border-left: 3px solid #bf8700; background: var(--bgColor-attention-muted, #fff8c5); }
  .stale p { margin: 0 0 6px; }
  .stale button { padding: 3px 10px; border-radius: 6px; cursor: pointer; color: inherit; font-size: 12px;
    border: 1px solid var(--borderColor-default, #d1d9e0); background: var(--bgColor-default, #fff); }
  .stale button:disabled { opacity: .5; cursor: default; }
  a { color: var(--fgColor-accent, #0969da); }
  button, select { font: inherit; }
  .close { display: inline-flex; padding: 2px; border: 0; background: none; cursor: pointer; color: inherit; }
  svg { flex: none; }
  .progress { height: 4px; border-radius: 4px; background: var(--bgColor-muted, #eff2f5); overflow: hidden; margin-top: 10px; }
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
  header > span { display: flex; gap: 6px; align-items: center; }
  .menu-toggle { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 999px; cursor: pointer; font-size: 12px; color: inherit;
    border: 1px solid var(--borderColor-default, #d1d9e0); background: var(--bgColor-default, #fff); }
  .menu-toggle:hover, .menu-toggle.open { background: var(--bgColor-muted, #f6f8fa); border-color: #8250df; }
  .title { cursor: pointer; }
  .summary { color: var(--fgColor-muted, #59636e); }
  .activity { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--fgColor-muted, #59636e); }
  .spinner { flex: none; width: 12px; height: 12px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .where { display: inline-flex; align-items: center; gap: 4px; margin-top: 4px; padding: 0; border: 0; background: none; cursor: pointer; font-size: 12px; color: var(--fgColor-muted, #59636e); }
  .menu { display: flex; flex-direction: column; margin: 0 0 10px; padding: 6px; border-radius: 8px;
    border: 1px solid var(--borderColor-default, #d1d9e0); background: var(--bgColor-muted, #f6f8fa); }
  .menu .item { display: block; text-align: left; padding: 6px 8px; border: 0; border-radius: 6px; background: none; color: inherit; cursor: pointer; }
  .menu .item:hover:not(:disabled) { background: var(--bgColor-neutral-muted, rgba(175, 184, 193, .2)); }
  .menu .item:disabled { opacity: .5; cursor: default; }
  .menu details { margin: 4px 8px; }
  .bar { display: flex; align-items: center; gap: 4px; }
  .bar .spacer { flex: 1; }
  .icon { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border-radius: 6px; cursor: pointer;
    border: 1px solid var(--borderColor-default, #d1d9e0); background: var(--bgColor-default, #fff); color: inherit; }
  .icon.primary { width: 48px; background: #8250df; border-color: #8250df; color: #fff; }
  .icon:disabled { opacity: .35; cursor: default; }
  .file .level { margin: 0 0 0 6px; vertical-align: 1px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .shortcuts { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 6px 0 0; }
  .shortcuts dt { font-family: ui-monospace, Menlo, monospace; font-size: 11px; }
  .shortcuts dd { margin: 0; color: var(--fgColor-muted, #59636e); }
  .chapters { margin: 6px 0 0; padding-left: 20px; }
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
  .video-overlay { position: fixed; inset: 0; z-index: 2147483001; background: rgba(1, 4, 9, .72);
    display: flex; align-items: center; justify-content: center; }
  .video-box { position: relative; height: min(88vh, 960px); aspect-ratio: 9 / 16; border-radius: 16px; overflow: hidden;
    box-shadow: 0 24px 64px rgba(0,0,0,.5); background: #0d1117; }
  .video-box iframe { width: 100%; height: 100%; border: 0; }
  .video-close { display: flex; align-items: center; justify-content: center; position: absolute; top: 10px; right: 10px; width: 32px; height: 32px; border-radius: 50%; border: 0;
    background: rgba(0,0,0,.55); color: #fff; font-size: 15px; cursor: pointer; }
`;
