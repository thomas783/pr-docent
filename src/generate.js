// Panel side of local generation: asks the service worker to have the user's Claude Code write
// a tour for this PR. Resolves with the raw tour JSON; reports progress along the way.

import { i18nError } from "./i18n.js";

export function generateLocally(request, onProgress) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const port = chrome.runtime.connect({ name: "generate" });
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      port.disconnect();
      fn(value);
    };
    port.onMessage.addListener((message) => {
      if (message.type === "progress") onProgress(message);
      else if (message.type === "done") finish(resolve, message.tour);
      else if (message.type === "error") finish(reject, Object.assign(new Error(message.message), { notInstalled: message.notInstalled }));
    });
    port.onDisconnect.addListener(() => finish(reject, i18nError("generationStopped")));
    port.postMessage(request);
  });
}
