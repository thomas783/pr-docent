// Keyboard shortcuts. Alt (Option) combinations only: GitHub's diff view already uses bare
// arrow keys to move between diff cells and single letters (c, t, l, ...) for its own shortcuts.
// Keys are matched by physical code, since Option changes the typed character on macOS.

const ACTIONS = {
  ArrowRight: "next",
  ArrowLeft: "previous",
  ArrowDown: "nextFocus",
  ArrowUp: "previousFocus",
  KeyP: "toggle",
};

/** The tour action for a keydown event, or null when it isn't one of ours. */
export function actionForKey(event) {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  if (isTypingTarget(event.target)) return null;
  return ACTIONS[event.code] ?? null;
}

/** True while the user is typing (e.g. a review comment), so shortcuts must stay out of the way. */
export function isTypingTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = String(target.tagName || "").toUpperCase();
  return tag === "TEXTAREA" || tag === "SELECT" || (tag === "INPUT" && !["checkbox", "radio", "button"].includes(target.type));
}

/** Shortcut help shown in the panel. */
export const SHORTCUT_HELP = [
  ["Alt + → / ←", "다음 / 이전 단계"],
  ["Alt + ↓ / ↑", "다음 / 이전 집중 단계"],
  ["Alt + P", "재생 / 일시정지"],
];
