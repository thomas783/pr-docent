import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDecoder, encodeMessage, extensionIdFromKey, fillTemplate } from "../host/native.mjs";

describe("native messaging frames", () => {
  it("round-trips messages split and joined across chunks", () => {
    const messages = [{ type: "progress", seconds: 5 }, { type: "done", tour: { title: "한글 제목" } }];
    const bytes = Buffer.concat(messages.map(encodeMessage));
    const received = [];
    const decode = createDecoder((m) => received.push(m));
    decode(bytes.subarray(0, 3));
    decode(bytes.subarray(3, 30));
    decode(bytes.subarray(30));
    assert.deepEqual(received, messages);
  });

  it("measures the length in bytes, not characters", () => {
    assert.equal(encodeMessage("가").readUInt32LE(0), Buffer.byteLength('"가"'));
  });
});

describe("extensionIdFromKey", () => {
  it("derives the fixed ID of this extension from manifest.json", () => {
    const { key } = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
    assert.equal(extensionIdFromKey(key), "hleefogoiedjahnmjgmmgonckaeicppc");
  });
});

describe("fillTemplate", () => {
  it("fills known placeholders and keeps unknown ones", () => {
    assert.equal(fillTemplate("{{PR}} in {{LANGUAGE}} {{OTHER}}", { PR: "o/r#1", LANGUAGE: "a|b&c" }), "o/r#1 in a|b&c {{OTHER}}");
  });
});
