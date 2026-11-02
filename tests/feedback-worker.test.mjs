import { test, afterEach } from "node:test";
import assert from "node:assert";
import worker, { validate, buildIssue, defuseMentions } from "../worker/src/index.js";

const ORIGIN = "chrome-extension://deejphpcfjilekklajdhdhfepjbenjii";
const env = (extra = {}) => ({
  ALLOWED_ORIGINS: ORIGIN,
  GITHUB_REPO: "thomas783/pr-docent",
  GITHUB_TOKEN: "test-token",
  ...extra,
});
const req = (body, { origin = ORIGIN, method = "POST", headers = {} } = {}) =>
  new Request("https://relay.example/", {
    method,
    headers: { Origin: origin, "Content-Type": "application/json", ...headers },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
const good = { type: "bug", message: "Narration stops after the first step", version: "1.2.0", lang: "en" };

// Capture the outgoing GitHub call instead of hitting the network.
const realFetch = globalThis.fetch;
let calls = [];
function mockGitHub(status = 201) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ html_url: "https://github.com/thomas783/pr-docent/issues/9" }), { status });
  };
}
afterEach(() => (globalThis.fetch = realFetch));

test("validate rejects bad type and too-short/too-long messages", () => {
  assert.equal(validate(good), null);
  assert.equal(validate({ ...good, type: "spam" }), "bad-type");
  assert.equal(validate({ ...good, message: "  hi  " }), "too-short");
  assert.equal(validate({ ...good, message: "x".repeat(4001) }), "too-long");
  assert.equal(validate(null), "bad-payload");
});

test("buildIssue: typed title from the first line, defused mentions, metadata footer", () => {
  const issue = buildIssue({ ...good, message: "Hey @octocat it broke\nsecond line" });
  assert.equal(issue.title, "[Bug] Hey @​octocat it broke");
  assert.match(issue.body, /second line/);
  assert.match(issue.body, /v1\.2\.0 · en/);
  assert.equal(defuseMentions("mail a@b.com"), "mail a@​b.com");
});

test("rejects requests from other origins", async () => {
  mockGitHub();
  const res = await worker.fetch(req(good, { origin: "https://evil.example" }), env());
  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
});

test("answers the CORS preflight for the extension origin", async () => {
  const res = await worker.fetch(req(null, { method: "OPTIONS" }), env());
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
});

test("creates a GitHub issue and returns its URL", async () => {
  mockGitHub();
  const res = await worker.fetch(req(good), env());
  assert.equal(res.status, 201);
  assert.equal((await res.json()).url, "https://github.com/thomas783/pr-docent/issues/9");
  assert.equal(calls[0].url, "https://api.github.com/repos/thomas783/pr-docent/issues");
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-token");
  assert.equal(JSON.parse(calls[0].init.body).title, "[Bug] Narration stops after the first step");
});

test("invalid payload never reaches GitHub", async () => {
  mockGitHub();
  const res = await worker.fetch(req({ ...good, message: "short" }), env());
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "too-short");
  assert.equal(calls.length, 0);
});

test("rate limiter blocks before GitHub is called", async () => {
  mockGitHub();
  const limiter = { limit: async () => ({ success: false }) };
  const res = await worker.fetch(req(good), env({ FEEDBACK_LIMITER: limiter }));
  assert.equal(res.status, 429);
  assert.equal(calls.length, 0);
});

test("oversized bodies are refused", async () => {
  mockGitHub();
  const res = await worker.fetch(req(good, { headers: { "Content-Length": "999999" } }), env());
  assert.equal(res.status, 413);
});

test("a GitHub failure surfaces as 502", async () => {
  mockGitHub(401);
  const res = await worker.fetch(req(good), env());
  assert.equal(res.status, 502);
});

test("accepts the unpacked development install too", async () => {
  mockGitHub();
  const DEV = "chrome-extension://hleefogoiedjahnmjgmmgonckaeicppc";
  const res = await worker.fetch(req(good, { origin: DEV }), env({ ALLOWED_ORIGINS: `${ORIGIN},${DEV}` }));
  assert.equal(res.status, 201);
  assert.match(JSON.parse(calls[0].init.body).body, /Submitted from the PR Docent extension/);
});
