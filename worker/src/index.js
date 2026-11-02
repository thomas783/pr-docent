// PR Docent feedback relay — turns the in-extension feedback form into a GitHub issue.
// The GitHub token lives only in this Worker's secrets, never in the extension.
// Only the extension's origin is accepted, per-IP rate limited, and every issue is public,
// so the payload is limited to what the user typed plus the extension version/language.

export const TYPES = { bug: "Bug", idea: "Idea", question: "Question" };
export const MIN_LEN = 10;
export const MAX_LEN = 4000;
const MAX_BODY_BYTES = 16 * 1024;

const allowedOrigins = (env) =>
  (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);

const corsHeaders = (origin) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
});

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

// Public issues must not ping arbitrary GitHub users.
export const defuseMentions = (s) => s.replace(/@(?=[A-Za-z0-9-])/g, "@​");

// Returns an error code, or null when the payload is acceptable.
export function validate(p) {
  if (!p || typeof p !== "object") return "bad-payload";
  if (!TYPES[p.type]) return "bad-type";
  if (typeof p.message !== "string") return "bad-message";
  const len = p.message.trim().length;
  if (len < MIN_LEN) return "too-short";
  if (len > MAX_LEN) return "too-long";
  return null;
}

export function buildIssue({ type, message, version, lang }) {
  const text = defuseMentions(message.trim());
  const firstLine = text.split("\n")[0].slice(0, 80);
  const meta = [`v${String(version || "?").slice(0, 20)}`, String(lang || "?").slice(0, 10)].join(" · ");
  return {
    title: `[${TYPES[type]}] ${firstLine}`,
    body: `${text}\n\n---\n_Submitted from the PR Docent extension · ${meta}_`,
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (!allowedOrigins(env).includes(origin)) return json(403, { error: "forbidden" });
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json(405, { error: "method-not-allowed" }, cors);
    if (Number(request.headers.get("Content-Length") || 0) > MAX_BODY_BYTES)
      return json(413, { error: "too-large" }, cors);

    if (env.FEEDBACK_LIMITER) {
      const key = request.headers.get("CF-Connecting-IP") || "unknown";
      const { success } = await env.FEEDBACK_LIMITER.limit({ key });
      if (!success) return json(429, { error: "rate-limited" }, cors);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json(400, { error: "bad-json" }, cors);
    }
    const error = validate(payload);
    if (error) return json(400, { error }, cors);

    const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "pr-docent-feedback",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildIssue(payload)),
    });
    if (!res.ok) return json(502, { error: "github-failed" }, cors);
    const issue = await res.json();
    return json(201, { ok: true, url: issue.html_url }, cors);
  },
};
