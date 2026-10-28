// Shorts: a 30-45 second vertical video that explains a pull request to teammates who won't
// review it (planners, other teams) with pictures instead of code. Written from the PR's tour,
// rendered by the local host. Pure functions — no DOM, no chrome.*, no file system.
//
// A short (version 1):
// {
//   "version": 1,
//   "pr": { "owner": "...", "repo": "...", "number": 42 },
//   "title": "...", "hook": "What changes and why, in one sentence.",   // the opening card
//   "scenes": [ ...one of the kinds below... ],
//   "outro": "What it means or what to watch for, in one sentence."      // the closing card
// }
// Every scene has "headline" (a few words, shown large) and "narration" (read aloud, subtitled).
//   flow:      "steps": [{ "icon", "label", "detail", "status" }], "links": ["label between steps", ...]
//   compare:   "before": { "label", "items": [...] }, "after": { "label", "items": [...] }
//   structure: "groups": [{ "label", "items": [{ "icon", "label", "status" }] }]
//   points:    "points": [{ "icon", "text" }]
// status is "new", "changed" or "same" (default) and marks what this pull request adds or changes.

export const SHORT_LIMITS = {
  minScenes: 2, maxScenes: 4, titleChars: 40, headlineChars: 24, sentenceChars: 80,
  labelChars: 16, detailChars: 24, itemChars: 28, pointChars: 32,
};
export const SCENE_KINDS = ["flow", "compare", "structure", "points"];
const STATUSES = ["new", "changed", "same"];

const text = (value) => (typeof value === "string" ? value.trim() : "");

/** Validates and normalizes raw JSON. Returns { short, errors }; short is null when there are errors. */
export function parseShort(raw) {
  const errors = [];
  const fail = (message) => errors.push(message);
  if (!raw || typeof raw !== "object") return { short: null, errors: ["Short must be a JSON object"] };
  if (raw.version !== 1) fail(`Unsupported short version: ${raw.version}`);
  const pr = raw.pr || {};
  if (!pr.owner || !pr.repo || !Number.isInteger(pr.number)) fail("pr.owner, pr.repo and pr.number are required");
  for (const field of ["title", "hook", "outro"]) if (!text(raw[field])) fail(`${field} is required`);
  if (!Array.isArray(raw.scenes)) fail("scenes must be a list");

  const scenes = (raw.scenes || []).map((scene, i) => {
    const where = `scenes[${i}]`;
    const kind = scene?.kind;
    if (!SCENE_KINDS.includes(kind)) fail(`${where}.kind must be one of ${SCENE_KINDS.join(", ")}`);
    if (!text(scene?.headline)) fail(`${where}.headline is required`);
    if (!text(scene?.narration)) fail(`${where}.narration is required`);
    const status = (value, at) => {
      const s = value ?? "same";
      if (!STATUSES.includes(s)) fail(`${at}.status must be one of ${STATUSES.join(", ")}`);
      return s;
    };
    const list = (value, at) => {
      if (!Array.isArray(value) || value.length === 0) fail(`${at} must be a non-empty list`);
      return Array.isArray(value) ? value : [];
    };
    const base = { kind, headline: text(scene?.headline), narration: text(scene?.narration) };
    if (kind === "flow") {
      const steps = list(scene.steps, `${where}.steps`).map((step, s) => ({
        icon: text(step?.icon), label: text(step?.label), detail: text(step?.detail), status: status(step?.status, `${where}.steps[${s}]`),
      }));
      steps.forEach((step, s) => !step.label && fail(`${where}.steps[${s}].label is required`));
      return { ...base, steps, links: (Array.isArray(scene.links) ? scene.links : []).map(text) };
    }
    if (kind === "compare") {
      const side = (value, name) => ({ label: text(value?.label), items: list(value?.items, `${where}.${name}.items`).map(text) });
      return { ...base, before: side(scene.before, "before"), after: side(scene.after, "after") };
    }
    if (kind === "structure") {
      const groups = list(scene.groups, `${where}.groups`).map((group, g) => ({
        label: text(group?.label),
        items: list(group?.items, `${where}.groups[${g}].items`).map((item, j) => ({
          icon: text(item?.icon), label: text(item?.label), status: status(item?.status, `${where}.groups[${g}].items[${j}]`),
        })),
      }));
      return { ...base, groups };
    }
    if (kind === "points") {
      return { ...base, points: list(scene.points, `${where}.points`).map((point) => ({ icon: text(point?.icon), text: text(point?.text) })) };
    }
    return base;
  });

  if (errors.length) return { short: null, errors };
  return {
    short: { version: 1, pr: { owner: pr.owner, repo: pr.repo, number: pr.number }, title: text(raw.title), hook: text(raw.hook), scenes, outro: text(raw.outro) },
    errors: [],
  };
}

/** Problems that would make the video long or crowded on a phone screen. */
export function checkShort(short, limits = SHORT_LIMITS) {
  const errors = [];
  const tooLong = (value, max, where) => {
    if (value.length > max) errors.push(`${where} is ${value.length} characters; at most ${max}: "${value.slice(0, 24)}…"`);
  };
  const count = (n, min, max, where) => {
    if (n < min || n > max) errors.push(`${where}: ${n}; use ${min}-${max}`);
  };
  count(short.scenes.length, limits.minScenes, limits.maxScenes, "scenes (the opening and closing cards come on top)");
  tooLong(short.title, limits.titleChars, "title");
  tooLong(short.hook, limits.sentenceChars, "hook");
  tooLong(short.outro, limits.sentenceChars, "outro");
  short.scenes.forEach((scene, i) => {
    const where = `scenes[${i}] (${scene.kind})`;
    tooLong(scene.headline, limits.headlineChars, `${where} headline`);
    tooLong(scene.narration, limits.sentenceChars, `${where} narration`);
    if (scene.kind === "flow") {
      count(scene.steps.length, 2, 5, `${where} steps`);
      scene.steps.forEach((step, s) => {
        tooLong(step.label, limits.labelChars, `${where} steps[${s}].label`);
        tooLong(step.detail, limits.detailChars, `${where} steps[${s}].detail`);
      });
      if (scene.links.length > scene.steps.length - 1) errors.push(`${where}: ${scene.links.length} links for ${scene.steps.length} steps; at most one between each pair`);
      scene.links.forEach((link, l) => tooLong(link, limits.labelChars, `${where} links[${l}]`));
    } else if (scene.kind === "compare") {
      for (const name of ["before", "after"]) {
        tooLong(scene[name].label, limits.labelChars, `${where} ${name}.label`);
        count(scene[name].items.length, 1, 3, `${where} ${name}.items`);
        scene[name].items.forEach((item, j) => tooLong(item, limits.itemChars, `${where} ${name}.items[${j}]`));
      }
    } else if (scene.kind === "structure") {
      count(scene.groups.length, 1, 3, `${where} groups`);
      count(scene.groups.reduce((n, g) => n + g.items.length, 0), 1, 8, `${where} items in all groups`);
      scene.groups.forEach((group, g) => {
        tooLong(group.label, limits.labelChars, `${where} groups[${g}].label`);
        group.items.forEach((item, j) => tooLong(item.label, limits.labelChars, `${where} groups[${g}].items[${j}].label`));
      });
    } else if (scene.kind === "points") {
      count(scene.points.length, 2, 3, `${where} points`);
      scene.points.forEach((point, p) => tooLong(point.text, limits.pointChars, `${where} points[${p}]`));
    }
  });
  return errors;
}

/** How many elements a scene reveals one at a time while its sentence is read. */
export function revealSteps(scene) {
  if (scene.kind === "flow") return scene.steps.length;
  if (scene.kind === "compare") return 2;
  if (scene.kind === "structure") return scene.groups.length;
  if (scene.kind === "points") return scene.points.length;
  return 1;
}

/** The short for [pr] among the code blocks of the PR's comments, or null (like findTourInBlocks). */
export function findShortInBlocks(blocks, { owner, repo, number }) {
  let found = null;
  for (const text of blocks) {
    let raw;
    try {
      raw = JSON.parse(text);
    } catch {
      continue;
    }
    const forThisPr = raw?.version === 1 && raw.pr?.owner === owner && raw.pr?.repo === repo && raw.pr?.number === number;
    if (forThisPr && Array.isArray(raw.scenes) && typeof raw.hook === "string") found = raw;
  }
  return found;
}
