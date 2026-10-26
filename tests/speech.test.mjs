import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickVoice } from "../src/speech.js";

const voice = (name, lang = "ko-KR") => ({ name, lang });

describe("pickVoice", () => {
  it("prefers Yuna over the voices listed before it", () => {
    const voices = [voice("Eddy (Korean (South Korea))"), voice("Rocko (Korean (South Korea))"), voice("Yuna")];
    assert.equal(pickVoice(voices, "ko-KR").name, "Yuna");
  });

  it("prefers the Premium Yuna download", () => {
    const voices = [voice("Yuna"), voice("Yuna (Premium)")];
    assert.equal(pickVoice(voices, "ko-KR").name, "Yuna (Premium)");
  });

  it("falls back to the first voice of the language", () => {
    const voices = [voice("Samantha", "en-US"), voice("Google 한국의"), voice("Eddy (Korean (South Korea))")];
    assert.equal(pickVoice(voices, "ko-KR").name, "Google 한국의");
  });

  it("returns undefined when no voice matches", () => {
    assert.equal(pickVoice([voice("Samantha", "en-US")], "ko-KR"), undefined);
  });
});
