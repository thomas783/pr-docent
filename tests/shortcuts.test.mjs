import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { actionForKey, isTypingTarget } from "../src/shortcuts.js";

const key = (code, extra = {}) => ({ code, altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, target: { tagName: "BODY" }, ...extra });

describe("actionForKey", () => {
  it("maps Alt combinations by physical key", () => {
    assert.equal(actionForKey(key("ArrowRight")), "next");
    assert.equal(actionForKey(key("ArrowLeft")), "previous");
    assert.equal(actionForKey(key("ArrowDown")), "nextFocus");
    assert.equal(actionForKey(key("ArrowUp")), "previousFocus");
    // Option+P types "π" on macOS; the code is still KeyP.
    assert.equal(actionForKey(key("KeyP", { key: "π" })), "toggle");
  });

  it("leaves GitHub's own keys alone", () => {
    assert.equal(actionForKey(key("ArrowRight", { altKey: false })), null, "bare arrows move between diff cells");
    assert.equal(actionForKey(key("ArrowRight", { metaKey: true })), null);
    assert.equal(actionForKey(key("ArrowRight", { shiftKey: true })), null);
    assert.equal(actionForKey(key("KeyC")), null);
  });

  it("does nothing while typing", () => {
    assert.equal(actionForKey(key("ArrowRight", { target: { tagName: "TEXTAREA" } })), null);
  });
});

describe("isTypingTarget", () => {
  it("recognizes text inputs and editable content", () => {
    assert.ok(isTypingTarget({ tagName: "textarea" }));
    assert.ok(isTypingTarget({ tagName: "INPUT", type: "text" }));
    assert.ok(isTypingTarget({ tagName: "DIV", isContentEditable: true }));
    assert.ok(!isTypingTarget({ tagName: "INPUT", type: "checkbox" }));
    assert.ok(!isTypingTarget({ tagName: "BUTTON" }));
    assert.ok(!isTypingTarget(null));
  });
});
