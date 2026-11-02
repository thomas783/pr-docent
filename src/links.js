// Where first-time users are sent: the demo pull request and the setup guides, in their language.

const REPO = "https://github.com/thomas783/pr-docent";

export const DEMO_PULLS = { en: `${REPO}/pull/22/changes`, ko: `${REPO}/pull/23/changes` };

export const GUIDES = {
  en: { actions: `${REPO}#generating-tours-automatically-github-actions`, local: `${REPO}#generating-tours-locally-your-own-claude-code` },
  ko: { actions: `${REPO}/blob/main/README.ko.md#투어-자동-생성-github-actions`, local: `${REPO}/blob/main/README.ko.md#투어-로컬-생성-본인-claude-code` },
};

/** True for the demo pull requests themselves, which always have tours. */
export function isDemoPull({ owner, repo, number }) {
  return owner === "thomas783" && repo === "pr-docent" && (number === 22 || number === 23);
}
