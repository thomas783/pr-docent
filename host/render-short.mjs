// Renders a short (see src/short.js) to a vertical MP4 on macOS. Each scene is drawn as HTML
// diagrams captured by headless Chrome, one frame per element so the picture builds up while the
// sentence is read; narration comes from `say` (speechSynthesis audio can't be recorded), and
// ffmpeg joins everything.

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { FRAME_HEIGHT as HEIGHT, FRAME_WIDTH as WIDTH, SHORT_CSS, sceneList, sceneMarkup, sceneSteps } from "../src/short-scenes.js";

const run = promisify(execFile);
const LEAD_IN = 0.3; // seconds of silence before each sentence
const TAIL = 0.8; // and after it
const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];
const PREFERRED_VOICES = { ko: ["Yuna (Premium)", "Yuna (Enhanced)", "Yuna"], en: ["Samantha (Premium)", "Samantha (Enhanced)", "Samantha"] };

/** Writes the MP4 for [short] to [outPath], working in [workDir]. Calls onProgress(text) per scene. */
export async function renderShort({ short, outPath, workDir, onProgress = () => {} }) {
  const chrome = CHROME_PATHS.find(existsSync);
  if (!chrome) throw new Error("Google Chrome was not found in /Applications.");
  await requireTool("ffmpeg", ["-version"], "ffmpeg is required: brew install ffmpeg");
  const voice = await pickSayVoice(/[가-힣]/.test(JSON.stringify(short)) ? "ko" : "en");
  const scenes = sceneList(short);
  mkdirSync(workDir, { recursive: true });

  const clips = [];
  for (const [i, scene] of scenes.entries()) {
    onProgress(`${i + 1}/${scenes.length}`);
    const base = join(workDir, `scene-${i}`);
    await run("say", ["-v", voice, "-o", `${base}.aiff`, scene.narration]);
    const audio = Number((await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", `${base}.aiff`])).stdout);

    // One frame per revealed element, spread across the sentence.
    const steps = sceneSteps(scene);
    const frames = [];
    for (let shown = 1; shown <= steps; shown++) {
      const png = `${base}-${shown}.png`;
      writeFileSync(`${base}.html`, pageHtml(scene, { short, shown }));
      await run(chrome, [
        "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
        `--user-data-dir=${join(workDir, "chrome-profile")}`, `--window-size=${WIDTH},${HEIGHT}`,
        `--screenshot=${png}`, `file://${base}.html`,
      ]);
      const duration = audio / steps + (shown === 1 ? LEAD_IN : 0) + (shown === steps ? TAIL : 0);
      frames.push(`file '${png}'\nduration ${duration.toFixed(3)}`);
    }
    frames.push(`file '${base}-${steps}.png'`); // the concat demuxer needs the last frame twice
    writeFileSync(`${base}.txt`, frames.join("\n"));

    const delay = Math.round(LEAD_IN * 1000);
    await run("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0", "-i", `${base}.txt`, "-i", `${base}.aiff`,
      "-filter_complex", `[0:v]fps=30,format=yuv420p[v];[1:a]adelay=${delay}|${delay},apad[a]`,
      "-map", "[v]", "-map", "[a]", "-t", (LEAD_IN + audio + TAIL).toFixed(2),
      "-c:v", "libx264", "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2", `${base}.mp4`,
    ]);
    clips.push(`${base}.mp4`);
  }

  onProgress("…");
  const list = join(workDir, "clips.txt");
  writeFileSync(list, clips.map((clip) => `file '${clip}'`).join("\n"));
  await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", outPath]);
  return outPath;
}

async function requireTool(command, args, message) {
  try {
    await run(command, args);
  } catch {
    throw new Error(message);
  }
}

async function pickSayVoice(language) {
  const { stdout } = await run("say", ["-v", "?"]);
  const names = stdout.split("\n").map((line) => line.split(/\s{2,}/)[0].trim());
  return PREFERRED_VOICES[language].find((name) => names.includes(name)) ?? (language === "ko" ? "Yuna" : "Samantha");
}

/** A whole page for the screenshot: the shared frame with nothing around it. */
function pageHtml(scene, options) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>body { margin: 0; } ${SHORT_CSS}</style></head>
    <body><div class="short-frame">${sceneMarkup(scene, options)}</div></body></html>`;
}
