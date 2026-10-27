// Renders a short (see src/short.js) to a vertical MP4 on macOS. Each scene is drawn as HTML
// diagrams captured by headless Chrome, one frame per element so the picture builds up while the
// sentence is read; narration comes from `say` (speechSynthesis audio can't be recorded), and
// ffmpeg joins everything.

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { revealSteps } from "../src/short.js";

const run = promisify(execFile);
const WIDTH = 1080;
const HEIGHT = 1920;
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
    const steps = scene.kind === "card" ? 1 : revealSteps(scene);
    const frames = [];
    for (let shown = 1; shown <= steps; shown++) {
      const png = `${base}-${shown}.png`;
      writeFileSync(`${base}.html`, pageHtml(scene, { short, shown, index: i, total: scenes.length }));
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

/** The opening card, the diagram scenes, and the closing card. */
export function sceneList(short) {
  return [
    { kind: "card", headline: short.title, narration: short.hook, opening: true },
    ...short.scenes,
    { kind: "card", headline: short.title, narration: short.outro, opening: false },
  ];
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

const esc = (value) => String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Classes for the [i]th element when [shown] are visible: hidden until its turn, lit when it arrives. */
const reveal = (i, shown) => (i >= shown ? " hidden" : i === shown - 1 ? " current" : "");
const badge = (status) => (status === "new" ? '<em class="tag new">NEW</em>' : status === "changed" ? '<em class="tag changed">수정</em>' : "");

function diagram(scene, shown) {
  if (scene.kind === "flow") {
    return `<div class="flow">${scene.steps.map((step, i) => `
      ${i > 0 ? `<div class="arrow${reveal(i, shown)}">${scene.links[i - 1] ? `<span>${esc(scene.links[i - 1])}</span>` : ""}</div>` : ""}
      <div class="node ${step.status}${reveal(i, shown)}"><div class="ico">${esc(step.icon)}</div>
        <div><b>${esc(step.label)}${badge(step.status)}</b>${step.detail ? `<small>${esc(step.detail)}</small>` : ""}</div></div>`).join("")}</div>`;
  }
  if (scene.kind === "compare") {
    const side = (value, cls, i) => `<div class="side ${cls}${reveal(i, shown)}"><p class="side-label">${esc(value.label)}</p>
      <ul>${value.items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></div>`;
    return `<div class="compare">${side(scene.before, "before", 0)}<div class="arrow${reveal(1, shown)}"></div>${side(scene.after, "after", 1)}</div>`;
  }
  if (scene.kind === "structure") {
    return `<div class="structure">${scene.groups.map((group, i) => `
      <div class="group${reveal(i, shown)}"><p class="group-label">${esc(group.label)}</p><div class="chips">${group.items.map((item) =>
        `<span class="chip ${item.status}">${item.icon ? `${esc(item.icon)} ` : ""}${esc(item.label)}${badge(item.status)}</span>`).join("")}</div></div>`).join("")}</div>`;
  }
  if (scene.kind === "points") {
    return `<div class="points">${scene.points.map((point, i) => `
      <div class="point${reveal(i, shown)}"><div class="ico">${esc(point.icon || "•")}</div><p>${esc(point.text)}</p></div>`).join("")}</div>`;
  }
  return "";
}

function pageHtml(scene, { short, shown, index, total }) {
  const { owner, repo, number } = short.pr;
  const main = scene.kind === "card"
    ? `<div class="card"><p class="repo">${esc(scene.opening ? `${owner}/${repo} #${number}` : `github.com/${owner}/${repo}/pull/${number}`)}</p><h1>${esc(scene.headline)}</h1></div>`
    : `<h2>${esc(scene.headline)}</h2><div class="stage">${diagram(scene, shown)}</div>`;
  const dots = Array.from({ length: total }, (_, i) => `<span${i === index ? ' class="on"' : ""}></span>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; display: flex; flex-direction: column;
      background: linear-gradient(160deg, #161b22 0%, #0d1117 55%, #1f1235 100%); color: #f0f6fc;
      font-family: -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; word-break: keep-all; }
    header { padding: 64px 72px 0; font-size: 30px; color: #a78bfa; font-weight: 700; }
    header span { color: #8b949e; font-weight: 500; }
    main { flex: 1; display: flex; flex-direction: column; padding: 0 72px; }
    .card { margin: auto 0; }
    .card .repo { font-size: 34px; color: #8b949e; margin-bottom: 28px; }
    .card h1 { font-size: 80px; line-height: 1.25; font-weight: 800; }
    h2 { padding-top: 56px; font-size: 66px; line-height: 1.25; font-weight: 800; color: #f0f6fc; }
    .stage { flex: 1; display: flex; align-items: center; justify-content: center; }
    .hidden { opacity: 0; }
    .current { box-shadow: 0 0 0 4px rgba(167, 139, 250, .55), 0 0 48px rgba(130, 80, 223, .55); }
    .tag { font-style: normal; margin-left: 14px; font-size: 22px; padding: 4px 12px; border-radius: 999px; vertical-align: middle; }
    .tag.new { background: #8250df; } .tag.changed { background: #9a6700; }
    .ico { font-size: 60px; width: 80px; text-align: center; flex: none; }
    .flow { width: 100%; display: flex; flex-direction: column; align-items: center; }
    .node { width: 100%; border-radius: 28px; padding: 28px 36px; background: #161b22; border: 3px solid #30363d; display: flex; gap: 26px; align-items: center; }
    .node b { display: block; font-size: 44px; }
    .node small { display: block; font-size: 30px; color: #8b949e; margin-top: 6px; }
    .node.new { border-color: #8250df; background: rgba(130, 80, 223, .14); }
    .node.changed { border-color: #bf8700; background: rgba(191, 135, 0, .12); }
    .arrow { height: 76px; width: 6px; background: #484f58; position: relative; margin: 6px 0 14px; flex: none; }
    .arrow::after { content: ""; position: absolute; bottom: -10px; left: -12px; border: 15px solid transparent; border-top-color: #484f58; }
    .arrow.current { box-shadow: none; }
    .arrow span { position: absolute; left: 32px; top: 18px; white-space: nowrap; font-size: 28px; color: #8b949e; }
    .compare { width: 100%; display: flex; flex-direction: column; align-items: center; }
    .side { width: 100%; border-radius: 28px; padding: 34px 40px; border: 3px solid #30363d; background: #161b22; }
    .side.before { opacity: .75; } .side.before.hidden { opacity: 0; }
    .side.after { border-color: #8250df; background: rgba(130, 80, 223, .14); }
    .side-label { font-size: 32px; font-weight: 700; color: #a78bfa; margin-bottom: 16px; }
    .side.before .side-label { color: #8b949e; }
    .side li { list-style: none; font-size: 42px; line-height: 1.5; font-weight: 600; }
    .side li::before { content: "· "; color: #8b949e; }
    .structure { width: 100%; display: flex; flex-direction: column; gap: 34px; }
    .group { border-radius: 28px; padding: 30px 34px; border: 3px dashed #30363d; }
    .group-label { font-size: 32px; font-weight: 700; color: #8b949e; margin-bottom: 18px; }
    .chips { display: flex; flex-wrap: wrap; gap: 16px; }
    .chip { font-size: 38px; font-weight: 700; padding: 16px 26px; border-radius: 20px; background: #161b22; border: 3px solid #30363d; }
    .chip.new { border-color: #8250df; background: rgba(130, 80, 223, .16); }
    .chip.changed { border-color: #bf8700; background: rgba(191, 135, 0, .12); }
    .points { width: 100%; display: flex; flex-direction: column; gap: 30px; }
    .point { display: flex; gap: 26px; align-items: center; border-radius: 28px; padding: 34px 36px; background: #161b22; border: 3px solid #30363d; }
    .point p { font-size: 46px; line-height: 1.35; font-weight: 700; }
    footer { padding: 0 64px 96px; }
    .subtitle { background: rgba(13, 17, 23, .86); border: 2px solid #8250df; border-radius: 28px; padding: 30px 40px;
      font-size: 42px; line-height: 1.4; font-weight: 700; text-align: center; }
    .dots { display: flex; justify-content: center; gap: 14px; margin-top: 36px; }
    .dots span { width: 16px; height: 16px; border-radius: 50%; background: #30363d; }
    .dots span.on { background: #a78bfa; }
  </style></head><body>
    <header>PR Docent <span>· ${esc(`${owner}/${repo} #${number}`)}</span></header>
    <main>${main}</main>
    <footer><p class="subtitle">${esc(scene.narration)}</p><div class="dots">${dots}</div></footer>
  </body></html>`;
}
