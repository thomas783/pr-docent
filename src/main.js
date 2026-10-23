// Mounts the tour panel on pull request pages. GitHub navigates without full page loads,
// so we watch the URL and mount/unmount as the user moves between pages.

import { parsePullRequestPath } from "./github.js";
import { TourPanel } from "./panel.js";

let panel = null;
let mountedFor = null;

function sync() {
  const pr = parsePullRequestPath(location.pathname);
  const key = pr ? `${pr.owner}/${pr.repo}/${pr.number}` : null;
  if (key === mountedFor) return;
  panel?.destroy();
  panel = pr ? new TourPanel(pr) : null;
  mountedFor = key;
}

export function start() {
  sync();
  // Covers both GitHub's turbo navigation and the React router used by the new diff view.
  let last = location.href;
  new MutationObserver(() => {
    if (location.href === last) return;
    last = location.href;
    sync();
  }).observe(document, { subtree: true, childList: true });
  window.addEventListener("popstate", sync);
}
