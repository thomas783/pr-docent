// Narration with the browser's built-in speech synthesis (no network, no cost).

export function speechAvailable() {
  return typeof speechSynthesis !== "undefined";
}

let current = null;
let spoken = 0;

/**
 * Speaks [text] starting at character [from]; resolves when it finishes or is cancelled.
 * Pass the same full text with from = spokenIndex() to resume where the last reading was.
 */
export async function speak(text, { lang = "ko-KR", rate = 1, from = 0 } = {}) {
  if (!speechAvailable() || !text.slice(from)) return;
  spoken = from;
  const voices = await loadVoices();
  return new Promise((resolve) => {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.slice(from));
    utterance.lang = lang;
    utterance.rate = rate;
    const voice = pickVoice(voices, lang);
    if (voice) utterance.voice = voice;
    current = utterance;
    // Word boundaries (macOS voices send them; some online voices don't, and then a
    // resume starts over from [from]).
    utterance.onboundary = (event) => {
      if (utterance === current && event.name === "word") spoken = from + event.charIndex;
    };
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    speechSynthesis.speak(utterance);
  });
}

/**
 * Chrome fills the voice list asynchronously, so right after a page load it
 * is empty; speaking then falls back to the system default (often English),
 * which reads only the punctuation of Korean text.
 */
function loadVoices(timeoutMs = 3000) {
  const voices = speechSynthesis.getVoices();
  if (voices.length) return Promise.resolve(voices);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      speechSynthesis.removeEventListener("voiceschanged", done);
      resolve(speechSynthesis.getVoices());
    };
    const timer = setTimeout(done, timeoutMs);
    speechSynthesis.addEventListener("voiceschanged", done);
  });
}

/**
 * Prefers macOS's Yuna (its Premium/Enhanced download first) over the novelty
 * voices (Eddy, Rocko, ...) that come first in the list.
 */
export function pickVoice(voices, lang) {
  const matching = voices.filter((v) => v.lang?.startsWith(lang.slice(0, 2)));
  return (
    matching.find((v) => /^Yuna \((Premium|Enhanced)\)/.test(v.name)) ??
    matching.find((v) => v.name.startsWith("Yuna")) ??
    matching[0]
  );
}

/** Index, in the text last passed to speak(), of the word being read. */
export function spokenIndex() {
  return spoken;
}

export function stopSpeaking() {
  if (speechAvailable()) speechSynthesis.cancel();
}
