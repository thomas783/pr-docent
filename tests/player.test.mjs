import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Player } from "../src/player.js";
import { parseTour } from "../src/tour.js";

const { tour } = parseTour({
  version: 1,
  pr: { owner: "o", repo: "r", number: 1 },
  chapters: [
    { title: "A", steps: [{ file: "a1" }, { file: "a2" }] },
    { title: "B", steps: [{ file: "b1" }] },
  ],
});

describe("Player", () => {
  it("walks forward and back across chapters", () => {
    const player = new Player(tour);
    assert.equal(player.current.file, "a1");
    assert.ok(player.isFirst && player.startsChapter);
    player.next();
    assert.equal(player.current.file, "a2");
    assert.ok(!player.startsChapter);
    player.next();
    assert.equal(player.current.file, "b1");
    assert.ok(player.isLast && player.startsChapter);
    player.previous();
    assert.equal(player.current.file, "a2");
  });

  it("stops playing at the end", () => {
    const player = new Player(tour, { startAt: 2 });
    player.play();
    assert.equal(player.next(), false);
    assert.equal(player.playing, false);
  });

  it("jumps to chapters and clamps indexes", () => {
    const player = new Player(tour, { startAt: 99 });
    assert.equal(player.current.file, "b1");
    player.goToChapter(0);
    assert.equal(player.current.file, "a1");
    assert.equal(player.goToChapter(5), false);
  });

  it("notifies listeners with the reason", () => {
    const player = new Player(tour);
    const events = [];
    const off = player.onChange((reason, p) => events.push(`${reason}:${p.index}`));
    player.play();
    player.next();
    player.toggle();
    player.goTo(1); // already there: no event
    off();
    player.next();
    assert.deepEqual(events, ["play:0", "step:1", "pause:1"]);
  });
});
