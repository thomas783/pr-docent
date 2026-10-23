// The tour panel: a floating launcher plus a side panel rendered in a shadow root, so
// GitHub's CSS and ours never collide. It owns playback: focusing steps on the page,
// narrating them, and advancing while playing.

import { clearHighlight, focusStep, listPullRequestFiles, parsePullRequestPath } from "./github.js";
import { Player } from "./player.js";
import { speak, speechAvailable, stopSpeaking } from "./speech.js";
import { parseTour, readingSeconds, tourFileName, uncoveredFiles } from "./tour.js";

const LEVEL_LABEL = { focus: "집중", skim: "훑기", skip: "생략 가능" };
const PANEL_WIDTH = 360;
const SETTINGS_KEY = "prdocent:settings";

export class TourPanel {
  constructor(pr) {
    this.pr = pr;
    this.key = `${pr.owner}/${pr.repo}/${pr.number}`;
    this.player = null;
    this.settings = { voice: speechAvailable(), rate: 1 };
    this.narrationToken = 0;
    this.status = "";
    this.host = document.createElement("div");
    this.host.id = "prdocent-root";
    this.root = this.host.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${STYLES}</style><button class="launcher" title="PR Docent">▶ PR Docent</button><aside class="panel" hidden></aside>`;
    this.launcher = this.root.querySelector(".launcher");
    this.panel = this.root.querySelector(".panel");
    this.launcher.addEventListener("click", () => this.toggleOpen());
    document.body.append(this.host);
  }

  async toggleOpen() {
    const opening = this.panel.hidden;
    this.panel.hidden = !opening;
    this.launcher.classList.toggle("active", opening);
    reservePageSpace(opening);
    if (!opening) return this.stop();
    if (!this.player) await this.load();
    this.render();
  }

  destroy() {
    this.stop();
    clearHighlight();
    reservePageSpace(false);
    this.host.remove();
  }

  /* ---------------- loading ---------------- */

  async load() {
    this.settings = { ...this.settings, ...(await storageGet(SETTINGS_KEY)) };
    const stored = await storageGet(`prdocent:tour:${this.key}`);
    const raw = stored ?? (await fetchBundledTour(this.pr));
    if (!raw) return;
    const { tour, errors } = parseTour(raw);
    if (errors.length) {
      this.status = `저장된 투어를 읽지 못했습니다: ${errors[0]}`;
      return;
    }
    this.start(tour, (await storageGet(`prdocent:pos:${this.key}`)) ?? 0);
  }

  async loadFromFile(file) {
    let raw;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      this.status = "JSON 형식이 아닙니다.";
      return this.render();
    }
    const { tour, errors } = parseTour(raw);
    if (errors.length) {
      this.status = `투어 형식 오류 ${errors.length}건: ${errors.slice(0, 3).join(" / ")}`;
      return this.render();
    }
    const { owner, repo, number } = tour.pr;
    this.status = owner === this.pr.owner && repo === this.pr.repo && number === this.pr.number
      ? ""
      : `이 투어는 ${owner}/${repo}#${number}용입니다. 파일 경로가 맞지 않을 수 있습니다.`;
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
      ? "이 파일이 페이지에 없습니다. 투어가 다른 버전의 PR용일 수 있습니다."
      : result.found === "file" && this.player.current.lines
        ? "해당 줄을 찾지 못해 파일 위치로 이동했습니다."
        : "";
  }

  async narrate() {
    const token = ++this.narrationToken;
    const step = this.player.current;
    const text = (this.player.startsChapter ? `${step.chapterTitle}. ` : "") + step.note;
    if (this.settings.voice) {
      await speak(text, { rate: this.settings.rate });
    } else {
      await sleep((readingSeconds(text) * 1000) / this.settings.rate);
    }
    if (token === this.narrationToken && this.player.playing) this.player.next();
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
        <p class="muted">이 PR의 투어가 없습니다. 투어 JSON 파일을 불러오세요.</p>
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
      <h2>${esc(tour.title || "리뷰 투어")}</h2>
      ${tour.summary ? `<details><summary>PR 요약</summary><p>${esc(tour.summary)}</p></details>` : ""}
      <div class="progress"><span style="width:${((this.player.index + 1) / total) * 100}%"></span></div>
      <p class="muted">${this.player.index + 1} / ${total} 단계</p>

      <section class="step">
        <p class="chapter">${esc(step.chapterTitle)}</p>
        <p class="file" title="${esc(step.file)}" data-action="refocus">${esc(step.file)}${step.lines ? `<span>:${step.lines[0]}-${step.lines[1]}</span>` : ""}</p>
        <span class="level ${step.level}">${LEVEL_LABEL[step.level]}</span>
        <p class="note">${esc(step.note)}</p>
        ${this.status ? `<p class="status">${esc(this.status)}</p>` : ""}
      </section>

      <div class="controls">
        <button data-action="prev" ${this.player.isFirst ? "disabled" : ""}>◀ 이전</button>
        <button class="primary" data-action="toggle">${this.player.playing ? "❚❚ 일시정지" : "▶ 재생"}</button>
        <button data-action="next" ${this.player.isLast ? "disabled" : ""}>다음 ▶</button>
      </div>
      <div class="settings">
        <label><input type="checkbox" data-action="voice" ${this.settings.voice ? "checked" : ""} ${speechAvailable() ? "" : "disabled"}> 음성 안내</label>
        <select data-action="rate">${[0.8, 1, 1.25, 1.5].map((r) => `<option value="${r}" ${r === this.settings.rate ? "selected" : ""}>${r}x</option>`).join("")}</select>
      </div>

      <h3>챕터</h3>
      <ol class="chapters">
        ${tour.chapters.map((c, i) => `<li class="${i === step.chapterIndex ? "current" : ""}" data-chapter="${i}"><b>${esc(c.title)}</b>${c.summary ? `<small>${esc(c.summary)}</small>` : ""}</li>`).join("")}
      </ol>

      ${uncovered.length ? `<details class="uncovered"><summary>⚠ 투어가 다루지 않은 파일 ${uncovered.length}개</summary><ul>${uncovered.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></details>` : ""}
      ${tour.skipped.length ? `<details><summary>건너뛴 파일 ${tour.skipped.length}개</summary><ul>${tour.skipped.map((s) => `<li>${esc(s.file)}<small>${esc(s.reason)}</small></li>`).join("")}</ul></details>` : ""}
      <details><summary>다른 투어 불러오기</summary>${this.fileInput()}</details>`;
    this.bind();
  }

  header() {
    const onDiff = parsePullRequestPath(location.pathname)?.onDiff;
    const { owner, repo, number } = this.pr;
    return `<header><strong>PR Docent</strong><button class="close" data-action="close" aria-label="닫기">✕</button></header>
      ${onDiff ? "" : `<p class="status">투어는 <a href="/${esc(owner)}/${esc(repo)}/pull/${number}/changes">Files changed</a> 탭에서 동작합니다.</p>`}`;
  }

  fileInput() {
    return `<label class="file-input">투어 JSON 불러오기<input type="file" accept="application/json,.json" data-action="file" hidden></label>`;
  }

  bind() {
    const on = (action, event, handler) =>
      this.panel.querySelectorAll(`[data-action="${action}"]`).forEach((el) => el.addEventListener(event, handler));
    on("close", "click", () => this.toggleOpen());
    on("file", "change", (e) => e.target.files[0] && this.loadFromFile(e.target.files[0]));
    if (!this.player) return;
    on("prev", "click", () => this.player.previous());
    on("next", "click", () => this.player.next());
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
    if (!this.settings.voice) stopSpeaking();
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
  .controls { display: flex; gap: 6px; margin-top: 10px; }
  .controls button { flex: 1; padding: 6px; border-radius: 6px; cursor: pointer;
    border: 1px solid var(--borderColor-default, #d1d9e0); background: var(--bgColor-default, #fff); color: inherit; }
  .controls button.primary { background: #8250df; border-color: #8250df; color: #fff; }
  .controls button:disabled { opacity: .4; cursor: default; }
  .settings { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
  .chapters { margin: 0; padding-left: 20px; }
  .chapters li { padding: 4px 0; cursor: pointer; }
  .chapters li.current b { color: #8250df; }
  .chapters small, ul small { display: block; color: var(--fgColor-muted, #59636e); }
  details { margin-top: 10px; }
  summary { cursor: pointer; font-weight: 600; }
  .uncovered summary { color: var(--fgColor-attention, #9a6700); }
  ul { padding-left: 18px; margin: 6px 0; font-family: ui-monospace, Menlo, monospace; font-size: 11px; word-break: break-all; }
  .file-input { display: inline-block; margin-top: 8px; padding: 6px 12px; border-radius: 6px; cursor: pointer;
    border: 1px solid var(--borderColor-default, #d1d9e0); }
`;
