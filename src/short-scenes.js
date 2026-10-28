// How a short looks: the scene markup and styles shared by the extension's live player and the
// MP4 renderer, so a short looks the same in both. Pure string building — no DOM, no chrome.*.
// Everything is laid out on a 1080x1920 frame (.short-frame) that players scale to fit.

import { revealSteps } from "./short.js";

export const FRAME_WIDTH = 1080;
export const FRAME_HEIGHT = 1920;

/** The opening card, the picture scenes, and the closing card. */
export function sceneList(short) {
  return [
    { kind: "card", headline: short.title, narration: short.hook, opening: true },
    ...short.scenes,
    { kind: "card", headline: short.title, narration: short.outro, opening: false },
  ];
}

/** How many elements [scene] reveals one at a time (cards show all at once). */
export function sceneSteps(scene) {
  return scene.kind === "card" ? 1 : revealSteps(scene);
}

const esc = (value) => String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Classes for the [i]th element when [shown] are visible: hidden until its turn, lit when it arrives. */
const reveal = (i, shown) => (i >= shown ? " hidden" : i === shown - 1 ? " current" : "");

function diagram(scene, shown, changedLabel) {
  const badge = (status) => (status === "new" ? '<em class="tag new">NEW</em>' : status === "changed" ? `<em class="tag changed">${esc(changedLabel)}</em>` : "");
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

/** The inside of a .short-frame for [scene] with [shown] of its elements visible. */
export function sceneMarkup(scene, { short, shown, index, total }) {
  const { owner, repo, number } = short.pr;
  const changedLabel = /[가-힣]/.test(JSON.stringify(short)) ? "수정" : "Changed";
  const main = scene.kind === "card"
    ? `<div class="card"><p class="repo">${esc(scene.opening ? `${owner}/${repo} #${number}` : `github.com/${owner}/${repo}/pull/${number}`)}</p><h1>${esc(scene.headline)}</h1></div>`
    : `<h2>${esc(scene.headline)}</h2><div class="stage">${diagram(scene, shown, changedLabel)}</div>`;
  const dots = Array.from({ length: total }, (_, i) => `<span${i === index ? ' class="on"' : ""}></span>`).join("");
  return `<header>PR Docent <span>· ${esc(`${owner}/${repo} #${number}`)}</span></header>
    <main>${main}</main>
    <footer><p class="subtitle">${esc(scene.narration)}</p><div class="dots">${dots}</div></footer>`;
}

export const SHORT_CSS = `
  .short-frame, .short-frame * { box-sizing: border-box; margin: 0; padding: 0; }
  .short-frame { width: ${FRAME_WIDTH}px; height: ${FRAME_HEIGHT}px; overflow: hidden; display: flex; flex-direction: column;
    background: linear-gradient(160deg, #161b22 0%, #0d1117 55%, #1f1235 100%); color: #f0f6fc;
    font-family: -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif; word-break: keep-all; }
  .short-frame header { padding: 64px 72px 0; font-size: 30px; color: #a78bfa; font-weight: 700; }
  .short-frame header span { color: #8b949e; font-weight: 500; }
  .short-frame main { flex: 1; display: flex; flex-direction: column; padding: 0 72px; }
  .short-frame .card { margin: auto 0; }
  .short-frame .card .repo { font-size: 34px; color: #8b949e; margin-bottom: 28px; }
  .short-frame .card h1 { font-size: 80px; line-height: 1.25; font-weight: 800; }
  .short-frame h2 { padding-top: 56px; font-size: 66px; line-height: 1.25; font-weight: 800; color: #f0f6fc; }
  .short-frame .stage { flex: 1; display: flex; align-items: center; justify-content: center; }
  .short-frame .hidden { opacity: 0; }
  .short-frame .current { box-shadow: 0 0 0 4px rgba(167, 139, 250, .55), 0 0 48px rgba(130, 80, 223, .55); }
  .short-frame .node, .short-frame .side, .short-frame .group, .short-frame .point, .short-frame .arrow { transition: opacity .45s ease, box-shadow .45s ease; }
  .short-frame .tag { font-style: normal; margin-left: 14px; font-size: 22px; padding: 4px 12px; border-radius: 999px; vertical-align: middle; }
  .short-frame .tag.new { background: #8250df; } .short-frame .tag.changed { background: #9a6700; }
  .short-frame .ico { font-size: 60px; width: 80px; text-align: center; flex: none; }
  .short-frame .flow { width: 100%; display: flex; flex-direction: column; align-items: center; }
  .short-frame .node { width: 100%; border-radius: 28px; padding: 28px 36px; background: #161b22; border: 3px solid #30363d; display: flex; gap: 26px; align-items: center; }
  .short-frame .node b { display: block; font-size: 44px; }
  .short-frame .node small { display: block; font-size: 30px; color: #8b949e; margin-top: 6px; }
  .short-frame .node.new { border-color: #8250df; background: rgba(130, 80, 223, .14); }
  .short-frame .node.changed { border-color: #bf8700; background: rgba(191, 135, 0, .12); }
  .short-frame .arrow { height: 76px; width: 6px; background: #484f58; position: relative; margin: 6px 0 14px; flex: none; }
  .short-frame .arrow::after { content: ""; position: absolute; bottom: -10px; left: -12px; border: 15px solid transparent; border-top-color: #484f58; }
  .short-frame .arrow.current { box-shadow: none; }
  .short-frame .arrow span { position: absolute; left: 32px; top: 18px; white-space: nowrap; font-size: 28px; color: #8b949e; }
  .short-frame .compare { width: 100%; display: flex; flex-direction: column; align-items: center; }
  .short-frame .side { width: 100%; border-radius: 28px; padding: 34px 40px; border: 3px solid #30363d; background: #161b22; }
  .short-frame .side.before { opacity: .75; } .short-frame .side.before.hidden { opacity: 0; }
  .short-frame .side.after { border-color: #8250df; background: rgba(130, 80, 223, .14); }
  .short-frame .side-label { font-size: 32px; font-weight: 700; color: #a78bfa; margin-bottom: 16px; }
  .short-frame .side.before .side-label { color: #8b949e; }
  .short-frame .side li { list-style: none; font-size: 42px; line-height: 1.5; font-weight: 600; }
  .short-frame .side li::before { content: "· "; color: #8b949e; }
  .short-frame .structure { width: 100%; display: flex; flex-direction: column; gap: 34px; }
  .short-frame .group { border-radius: 28px; padding: 30px 34px; border: 3px dashed #30363d; }
  .short-frame .group-label { font-size: 32px; font-weight: 700; color: #8b949e; margin-bottom: 18px; }
  .short-frame .chips { display: flex; flex-wrap: wrap; gap: 16px; }
  .short-frame .chip { font-size: 38px; font-weight: 700; padding: 16px 26px; border-radius: 20px; background: #161b22; border: 3px solid #30363d; }
  .short-frame .chip.new { border-color: #8250df; background: rgba(130, 80, 223, .16); }
  .short-frame .chip.changed { border-color: #bf8700; background: rgba(191, 135, 0, .12); }
  .short-frame .points { width: 100%; display: flex; flex-direction: column; gap: 30px; }
  .short-frame .point { display: flex; gap: 26px; align-items: center; border-radius: 28px; padding: 34px 36px; background: #161b22; border: 3px solid #30363d; }
  .short-frame .point p { font-size: 46px; line-height: 1.35; font-weight: 700; }
  .short-frame footer { padding: 0 64px 96px; }
  .short-frame .subtitle { background: rgba(13, 17, 23, .86); border: 2px solid #8250df; border-radius: 28px; padding: 30px 40px;
    font-size: 42px; line-height: 1.4; font-weight: 700; text-align: center; }
  .short-frame .dots { display: flex; justify-content: center; gap: 14px; margin-top: 36px; }
  .short-frame .dots span { width: 16px; height: 16px; border-radius: 50%; background: #30363d; }
  .short-frame .dots span.on { background: #a78bfa; }
`;
