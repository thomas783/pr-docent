import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { browserDataDirs, runningUserDataDirs } from "../bin/browsers.mjs";

describe("browserDataDirs", () => {
  it("lists Google Chrome's folder first", () => {
    assert.equal(browserDataDirs("/Users/a", "darwin")[0], "/Users/a/Library/Application Support/Google/Chrome");
    assert.equal(browserDataDirs("/home/a", "linux")[0], "/home/a/.config/google-chrome");
    assert.ok(browserDataDirs("/Users/a", "darwin").includes("/Users/a/Library/Application Support/Arc/User Data"));
    assert.deepEqual(browserDataDirs("C:/Users/a", "win32"), []);
  });
});

describe("runningUserDataDirs", () => {
  it("finds folders that running browsers were started with", () => {
    const ps = [
      // An automation tool's Chrome (the case that broke local generation).
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --no-startup-window --remote-debugging-port=9222 --user-data-dir=/Users/a/.hermes/chrome-debug --flag-switches-begin --flag-switches-end",
      // Its helper processes repeat the flag; they're not the browser.
      "/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Versions/1/Helpers/Google Chrome Helper.app/Contents/MacOS/Google Chrome Helper --type=renderer --user-data-dir=/Users/a/.hermes/chrome-debug",
      // A folder with a space, last on the line.
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser --user-data-dir=/Users/a/My Profiles/brave",
      // Other Chromium browsers.
      "/Applications/Arc.app/Contents/MacOS/Arc --user-data-dir=/Users/a/arc-test",
      "/Applications/Naver Whale.app/Contents/MacOS/Naver Whale --user-data-dir=/Users/a/whale-test --no-first-run",
      // A normal Chrome, and an Electron app with its own --user-data-dir.
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Visual Studio Code.app/Contents/MacOS/Electron --user-data-dir=/Users/a/Library/Application Support/Code",
    ].join("\n");
    assert.deepEqual(runningUserDataDirs(ps, "darwin"), ["/Users/a/.hermes/chrome-debug", "/Users/a/My Profiles/brave", "/Users/a/arc-test", "/Users/a/whale-test"]);
  });
  it("reads Linux command lines", () => {
    const ps = "/opt/google/chrome/chrome --user-data-dir=/tmp/profile --remote-debugging-port=9222\n/usr/bin/code --user-data-dir=/tmp/code";
    assert.deepEqual(runningUserDataDirs(ps, "linux"), ["/tmp/profile"]);
  });
});
