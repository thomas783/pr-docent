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

// Natural macOS voices; the first voices listed for a language are often novelty ones
// (Eddy, Rocko, Albert, ...).
const PREFERRED_VOICES = { ko: "Yuna", en: "Samantha" };

/**
 * Prefers the language's natural macOS voice (its Premium/Enhanced download first), then any
 * voice for the exact locale, then any voice for the language.
 */
export function pickVoice(voices, lang) {
  const base = lang.slice(0, 2);
  const matching = voices.filter((v) => v.lang?.startsWith(base));
  const preferred = PREFERRED_VOICES[base];
  return (
    (preferred && matching.find((v) => new RegExp(`^${preferred} \\((Premium|Enhanced)\\)`).test(v.name))) ??
    (preferred && matching.find((v) => v.name.startsWith(preferred))) ??
    matching.find((v) => v.lang === lang) ??
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
