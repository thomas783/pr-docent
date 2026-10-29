// Panel side of the local host: asks the service worker to have the user's Claude Code write a
// tour or a short's script for this PR, or to save a short as a video, reporting progress.

import { i18nError } from "./i18n.js";

/** Resolves with the raw tour JSON. */
export function generateLocally(request, onProgress) {
  return askHost("generate", request, onProgress).then((reply) => reply.tour);
}

/** Resolves with the raw short script. */
export function writeShortScript(request, onProgress) {
  return askHost("script", request, onProgress).then((reply) => reply.short);
}

/** Resolves with the path of the MP4 the host rendered from [short]. */
export function saveShortVideo(short, onProgress) {
  return askHost("render", { short }, onProgress).then((reply) => reply.path);
}

/** Shows a video the host wrote in Finder. */
export function revealFile(path) {
  return askHost("reveal", { path }, () => {});
}

function askHost(name, request, onProgress) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const port = chrome.runtime.connect({ name });
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      port.disconnect();
      fn(value);
    };
    port.onMessage.addListener((message) => {
      if (message.type === "progress") onProgress(message);
      else if (message.type === "done") finish(resolve, message);
      else if (message.type === "error") finish(reject, Object.assign(new Error(message.message), { notInstalled: message.notInstalled, code: message.code }));
    });
    port.onDisconnect.addListener(() => finish(reject, i18nError("generationStopped")));
    port.postMessage(request);
  });
}
