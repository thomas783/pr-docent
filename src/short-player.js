// Plays a short live in the extension's player page: draws each scene with the same markup the
// MP4 renderer uses, reads its sentence with the browser's speech synthesis, and reveals the
// picture's elements as the reading reaches them. Nothing is recorded or saved.

import { parseShort } from "./short.js";
import { FRAME_HEIGHT, FRAME_WIDTH, SHORT_CSS, sceneList, sceneMarkup, sceneSteps } from "./short-scenes.js";
import { speak, speechAvailable, spokenIndex, stopSpeaking } from "./speech.js";

const PAUSE_AFTER_SCENE_MS = 700;
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

  root.innerHTML = `<style>${SHORT_CSS}${PLAYER_CSS}</style>
    <div class="viewport"><div class="short-frame"></div></div>
    <div class="controls"><button data-go="-1" aria-label="Previous">⏮</button><button data-toggle aria-label="Play">▶</button><button data-go="1" aria-label="Next">⏭</button></div>
    <button class="start" aria-label="Play">▶</button>`;
  const frame = root.querySelector(".short-frame");
  const toggle = root.querySelector("[data-toggle]");
  const fit = () => {
    const scale = Math.min(innerWidth / FRAME_WIDTH, innerHeight / FRAME_HEIGHT);
    frame.style.transform = `scale(${scale})`;
  };
  fit();
  addEventListener("resize", fit);

  let index = 0;
  let token = 0;
  let playing = false;
  const draw = (i, shown) => {
    frame.innerHTML = sceneMarkup(scenes[i], { short, shown, index: i, total: scenes.length });
  };

  async function run(from) {
    const mine = ++token;
    playing = true;
    toggle.textContent = "❚❚";
    for (index = from; index < scenes.length; index++) {
      const scene = scenes[index];
      const steps = sceneSteps(scene);
      draw(index, 1);
      // Reveal the next element once the reading has covered its share of the sentence.
      let shown = 1;
      const follow = setInterval(() => {
        const next = Math.min(steps, 1 + Math.floor((spokenIndex() / scene.narration.length) * steps));
        if (next > shown) draw(index, (shown = next));
      }, 120);
      if (speechAvailable()) await speak(scene.narration, { lang, rate });
      else await sleep((Math.max(2, scene.narration.length / 12) * 1000) / rate);
      clearInterval(follow);
      if (mine !== token) return;
      draw(index, steps);
      await sleep(PAUSE_AFTER_SCENE_MS);
      if (mine !== token) return;
    }
    index = scenes.length - 1;
    playing = false;
    toggle.textContent = "▶";
  }

  function stop() {
    token++;
    playing = false;
    stopSpeaking();
    toggle.textContent = "▶";
  }

  draw(0, sceneSteps(scenes[0]));
  // Speech needs a click inside this page; a click in the GitHub page doesn't count.
  root.querySelector(".start").addEventListener("click", (event) => {
    event.currentTarget.remove();
    run(0);
  });
  toggle.addEventListener("click", () => (playing ? stop() : run(index)));
  root.querySelectorAll("[data-go]").forEach((button) =>
    button.addEventListener("click", () => {
      const target = Math.max(0, Math.min(scenes.length - 1, index + Number(button.dataset.go)));
      stop();
      root.querySelector(".start")?.remove();
      run(target);
    }),
  );
  addEventListener("keydown", (event) => {
    if (event.key === " ") toggle.click();
    if (event.key === "ArrowRight") root.querySelector('[data-go="1"]').click();
    if (event.key === "ArrowLeft") root.querySelector('[data-go="-1"]').click();
  });
}

const PLAYER_CSS = `
  .viewport { position: fixed; inset: 0; display: flex; align-items: flex-start; justify-content: center; overflow: hidden; }
  .viewport .short-frame { transform-origin: top center; flex: none; }
  .controls { position: fixed; left: 0; right: 0; bottom: 10px; display: flex; justify-content: center; gap: 10px; opacity: 0; transition: opacity .2s; }
  body:hover .controls { opacity: 1; }
  .controls button { width: 40px; height: 40px; border-radius: 50%; border: 0; cursor: pointer; font-size: 15px;
    background: rgba(0, 0, 0, .6); color: #fff; }
  .start { position: fixed; left: 50%; top: 50%; width: 88px; height: 88px; margin: -44px 0 0 -44px; border-radius: 50%; border: 0;
    cursor: pointer; font-size: 34px; background: #8250df; color: #fff; box-shadow: 0 12px 32px rgba(0, 0, 0, .45); }
`;
