// Playback state for a tour: which step is current and whether it auto-advances.
// No DOM or timers: the panel drives it and listens through onChange.

import { flattenSteps } from "./tour.js";

export class Player {
  constructor(tour, { startAt = 0 } = {}) {
    this.tour = tour;
    this.steps = flattenSteps(tour);
    this.index = clamp(startAt, 0, this.steps.length - 1);
    this.playing = false;
    this.listeners = new Set();
  }

  get current() {
    return this.steps[this.index];
  }

  get isFirst() {
    return this.index === 0;
  }

  get isLast() {
    return this.index === this.steps.length - 1;
  }

  /** True when the current step opens its chapter (narration introduces the chapter there). */
  get startsChapter() {
    return this.current.stepIndex === 0;
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  goTo(index) {
    const next = clamp(index, 0, this.steps.length - 1);
    if (next === this.index) return false;
    this.index = next;
    this.emit("step");
    return true;
  }

  next() {
    if (this.isLast) {
      this.pause();
      return false;
    }
    return this.goTo(this.index + 1);
  }

  previous() {
    return this.goTo(this.index - 1);
  }

  /** Jumps to the first step of a chapter. */
  goToChapter(chapterIndex) {
    const index = this.steps.findIndex((s) => s.chapterIndex === chapterIndex);
    return index >= 0 && this.goTo(index);
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this.emit("play");
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    this.emit("pause");
  }

  toggle() {
    this.playing ? this.pause() : this.play();
  }

  emit(reason) {
    for (const listener of this.listeners) listener(reason, this);
  }
}

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}
