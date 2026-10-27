import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { messageKeys, resolveLanguage, translate } from "../src/i18n.js";

describe("resolveLanguage", () => {
  it("uses the language picked in the popup", () => {
    assert.equal(resolveLanguage("ko", "en-US"), "ko");
    assert.equal(resolveLanguage("en", "ko-KR"), "en");
  });

  it("follows the browser on auto, defaulting to English", () => {
    assert.equal(resolveLanguage("auto", "ko-KR"), "ko");
    assert.equal(resolveLanguage("auto", "ja"), "en");
    assert.equal(resolveLanguage(undefined, ""), "en");
  });
});

describe("translate", () => {
  it("fills arguments", () => {
    assert.equal(translate("en", "stepOf", 2, 10), "Step 2 of 10");
    assert.equal(translate("ko", "stepOf", 2, 10), "2 / 10 단계");
  });

  it("falls back to English, then to the key", () => {
    assert.equal(translate("ja", "close"), "Close");
    assert.equal(translate("en", "noSuchKey"), "noSuchKey");
  });

  it("has every message in both languages", () => {
    assert.deepEqual(messageKeys("ko").sort(), messageKeys("en").sort());
  });
});
