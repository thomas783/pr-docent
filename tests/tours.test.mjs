import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { parseTour, tourFileName } from "../src/tour.js";

// Only the committed public examples; other tours in tours/ are local and git-ignored.
const examples = readdirSync(new URL("../tours/", import.meta.url)).filter((name) => name.startsWith("thomas783--pr-docent--"));

describe("example tours", () => {
  it("exist", () => assert.ok(examples.length > 0));

  for (const name of examples) {
    it(`${name} is a valid tour for the PR its name says`, () => {
      const { tour, errors } = parseTour(JSON.parse(readFileSync(new URL(`../tours/${name}`, import.meta.url), "utf8")));
      assert.deepEqual(errors, []);
      assert.equal(tourFileName(tour.pr), name);
    });
  }
});
