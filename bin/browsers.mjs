// Where to register the local helper so Chromium browsers find it. A browser looks for native
// messaging hosts in NativeMessagingHosts/ under its user data folder, so the helper is
// registered for each browser installed and for each folder a running browser was started with
// (--user-data-dir, as automation tools do).

import { join } from "node:path";

// User data folders of Chromium browsers that can install from the Chrome Web Store (the same
// folders Claude's and Codex's browser extensions register their hosts in; Whale's is its user
// data folder, unverified, and like the others only used when it exists).
const USER_DATA_DIRS = {
  darwin: [
    "Google/Chrome", "Google/Chrome Beta", "Google/Chrome Dev", "Google/Chrome Canary", "Google/Chrome for Testing",
    "Chromium", "BraveSoftware/Brave-Browser", "Microsoft Edge", "Arc/User Data", "Vivaldi", "com.operasoftware.Opera",
    "Naver/Whale",
  ].map((dir) => ["Library", "Application Support", ...dir.split("/")]),
  linux: [
    "google-chrome", "google-chrome-beta", "google-chrome-unstable", "chromium", "BraveSoftware/Brave-Browser", "microsoft-edge",
    "vivaldi", "opera", "naver-whale",
  ].map((dir) => [".config", ...dir.split("/")]),
};

/** The user data folders of [os]'s browsers under [home]; Google Chrome's comes first. */
export function browserDataDirs(home, os) {
  return (USER_DATA_DIRS[os] ?? []).map((parts) => join(home, ...parts));
}

// The main executable of a Chromium browser (not its helper processes), at the start of a command.
const BROWSER_COMMAND = {
  darwin: /^\S.*?\/(Google Chrome(?: Beta| Dev| Canary| for Testing)?|Chromium|Brave Browser|Microsoft Edge|Arc|Vivaldi|Opera|Naver Whale)\.app\/Contents\/MacOS\/\1(?= |$)/,
  linux: /^\S*?(?:^|\/)(?:chrome|google-chrome(?:-beta|-unstable)?|chromium(?:-browser)?|brave(?:-browser)?|msedge|microsoft-edge|vivaldi(?:-bin|-stable)?|opera|naver-whale(?:-stable)?|whale)(?= |$)/,
};

/**
 * The --user-data-dir folders of running browsers, from `ps -axo command=` output. ps doesn't
 * quote arguments, so a folder runs up to the next " --" option.
 */
export function runningUserDataDirs(psOutput, os) {
  const browser = BROWSER_COMMAND[os];
  if (!browser) return [];
  const dirs = psOutput
    .split("\n")
    .filter((line) => browser.test(line))
    .map((line) => line.match(/ --user-data-dir=(.+?)(?= --|$)/)?.[1]?.trim())
    .filter(Boolean);
  return [...new Set(dirs)];
}
