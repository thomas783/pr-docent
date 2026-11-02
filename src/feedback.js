// Feedback form → Cloudflare Worker relay (worker/) → public GitHub issue. Sent from the toolbar
// popup, an extension page, because the relay accepts only PR Docent's extension origins.

export const FEEDBACK_ENDPOINT = "https://pr-docent-feedback.keeptabs.workers.dev";
export const ISSUES_URL = "https://github.com/thomas783/pr-docent/issues";

/** Resolves to the created issue's URL; throws Error(code) on failure ("too-short", "rate-limited", … or "network"). */
export async function sendFeedback({ type, message, lang }) {
  let res;
  try {
    res = await fetch(FEEDBACK_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, message, lang, version: chrome.runtime.getManifest().version }),
    });
  } catch {
    throw new Error("network");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "failed");
  return data.url;
}
