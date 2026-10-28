// Plays a short live in the extension's player page: draws each scene with the same markup the
// MP4 renderer uses, reads its sentence with the browser's speech synthesis, and reveals the
// picture's elements as the reading reaches them. Nothing is recorded or saved.

import { svg } from "./icons.js";
import { parseShort } from "./short.js";
import { FRAME_HEIGHT, FRAME_WIDTH, SHORT_CSS, sceneList, sceneMarkup, sceneSteps, wordStartAt } from "./short-scenes.js";
import { speak, speechAvailable, spokenIndex, stopSpeaking } from "./speech.js";

const PAUSE_AFTER_SCENE_MS = 700;
const CONTROLS_HEIGHT = 72;
// Reading speed assumed when the browser has no speech synthesis.
const CHARS_PER_SECOND = 12;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Plays the short stored under chrome.storage.local [key] inside [root]. */
export async function playShort(root, key) {
  const raw = (await chrome.storage.local.get(key))[key];
  const { short, errors } = parseShort(raw);
  if (!short) throw new Error(errors[0] ?? "No short to play");
  const settings = (await chrome.storage.local.get("prdocent:settings"))["prdocent:settings"] ?? {};
  const rate = settings.rate ?? 1;
  const lang = /[가-힣]/.test(JSON.stringify(short)) ? "ko-KR" : "en-US";
  const scenes = sceneList(short);
  const last = scenes.length - 1;

  root.innerHTML = `<style>${SHORT_CSS}${PLAYER_CSS}</style>
    <div class="viewport"><div class="short-frame"></div></div>
    <div class="controls">
      <div class="track">${scenes.map(() => '<span class="segment"><i></i></span>').join("")}</div>
      <div class="buttons"><button data-go="-1" aria-label="Previous scene">${svg("skipBack", 18)}</button><button class="toggle" aria-label="Play">${svg("play", 20)}</button><button data-go="1" aria-label="Next scene">${svg("skipForward", 18)}</button></div>
    </div>
    <button class="start" aria-label="Play">${svg("play", 36)}</button>`;
  const frame = root.querySelector(".short-frame");
  const toggle = root.querySelector(".toggle");
  const fills = [...root.querySelectorAll(".segment i")];
  const fit = () => {
    const scale = Math.min(innerWidth / FRAME_WIDTH, (innerHeight - CONTROLS_HEIGHT) / FRAME_HEIGHT);
    frame.style.transform = `scale(${scale})`;
  };
  fit();
  addEventListener("resize", fit);

  // Where playback is: the scene, and the character its reading has reached.
  let index = 0;
  let pos = 0;
  let token = 0;
  let playing = false;
  const length = (i) => scenes[i].narration.length;
  const draw = (i, shown) => {
    frame.innerHTML = sceneMarkup(scenes[i], { short, shown, index: i, total: scenes.length });
  };
  const paint = () =>
    fills.forEach((fill, i) => {
      fill.style.width = `${i < index ? 100 : i > index ? 0 : Math.min(100, (pos / length(i)) * 100)}%`;
    });
  const showPlaying = (on) => {
    playing = on;
    toggle.innerHTML = svg(on ? "pause" : "play", 20);
    toggle.setAttribute("aria-label", on ? "Pause" : "Play");
  };

  /** Plays from character [at] of scene [from] to the end. */
  async function run(from, at = 0) {
    const mine = ++token;
    root.querySelector(".start")?.remove();
    showPlaying(true);
    for (index = from; index <= last; index++) {
      const scene = scenes[index];
      const steps = sceneSteps(scene);
      const start = index === from ? at : 0;
      // Reveal the next element once the reading has covered its share of the sentence.
      const shownAt = (p) => Math.min(steps, 1 + Math.floor((p / length(index)) * steps));
      let shown = shownAt(start);
      pos = start;
      draw(index, shown);
      paint();
      const began = Date.now();
      const follow = setInterval(() => {
        // Paused or moved elsewhere: the wait below may not end right away (without speech).
        if (mine !== token) return clearInterval(follow);
        pos = speechAvailable() ? spokenIndex() : Math.min(length(index), start + ((Date.now() - began) / 1000) * CHARS_PER_SECOND * rate);
        const next = shownAt(pos);
        if (next > shown) draw(index, (shown = next));
        paint();
      }, 100);
      if (speechAvailable()) await speak(scene.narration, { lang, rate, from: start });
      else await sleep(((length(index) - start) / CHARS_PER_SECOND / rate) * 1000);
      clearInterval(follow);
      if (mine !== token) return;
      pos = length(index);
      draw(index, steps);
      paint();
      await sleep(PAUSE_AFTER_SCENE_MS);
      if (mine !== token) return;
    }
    index = last;
    showPlaying(false);
  }

  /** Pauses where the reading is; playing again resumes from that word. */
  function stop() {
    token++;
    stopSpeaking();
    showPlaying(false);
  }

  function resume() {
    if (pos < length(index)) return run(index, pos);
    run(index < last ? index + 1 : 0);
  }

  function seek(i, at = 0) {
    stop();
    run(i, at);
  }

  draw(0, sceneSteps(scenes[0]));
  paint();
  // Speech needs a click inside this page; a click in the GitHub page doesn't count.
  root.querySelector(".start").addEventListener("click", () => run(0));
  toggle.addEventListener("click", () => (playing ? stop() : resume()));
  root.querySelectorAll("[data-go]").forEach((button) =>
    button.addEventListener("click", () => seek(Math.max(0, Math.min(last, index + Number(button.dataset.go))))),
  );
  // Clicking the bar jumps to that scene, at the word nearest the click.
  root.querySelectorAll(".segment").forEach((segment, i) =>
    segment.addEventListener("click", (event) => {
      const box = segment.getBoundingClientRect();
      seek(i, wordStartAt(scenes[i].narration, (event.clientX - box.left) / box.width));
    }),
  );
  const KEYS = { " ": () => toggle.click(), ArrowRight: () => root.querySelector('[data-go="1"]').click(), ArrowLeft: () => root.querySelector('[data-go="-1"]').click() };
  addEventListener("keydown", (event) => {
    if (!KEYS[event.key]) return;
    // Otherwise Space would also press the focused button.
    event.preventDefault();
    KEYS[event.key]();
  });
}

const PLAYER_CSS = `
  .viewport { position: fixed; top: 0; left: 0; right: 0; bottom: ${CONTROLS_HEIGHT}px; display: flex; align-items: flex-start; justify-content: center; overflow: hidden; }
  .viewport .short-frame { transform-origin: top center; flex: none; }
  .controls { position: fixed; left: 0; right: 0; bottom: 0; height: ${CONTROLS_HEIGHT}px; padding: 0 16px; display: flex; flex-direction: column; justify-content: center; gap: 6px; }
  .track { display: flex; gap: 4px; }
  /* A gray 4px line per scene, filled in purple as it is read; the padding makes it easy to click. */
  .segment { flex: 1; padding: 6px 0; cursor: pointer; background: linear-gradient(#30363d, #30363d) center / 100% 4px no-repeat; }
  .segment i { display: block; height: 4px; width: 0; border-radius: 2px; background: #a78bfa; }
  .buttons { display: flex; justify-content: center; gap: 12px; }
  .buttons button { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 50%; border: 0; cursor: pointer;
    background: none; color: #f0f6fc; }
  .buttons button:hover { background: rgba(255, 255, 255, .1); }
  .buttons .toggle { background: rgba(255, 255, 255, .12); }
  .start { position: fixed; left: 50%; top: calc(50% - ${CONTROLS_HEIGHT / 2}px); width: 88px; height: 88px; margin: -44px 0 0 -44px; border-radius: 50%; border: 0;
    display: flex; align-items: center; justify-content: center; padding-left: 6px;
    cursor: pointer; background: #8250df; color: #fff; box-shadow: 0 12px 32px rgba(0, 0, 0, .45); }
`;
