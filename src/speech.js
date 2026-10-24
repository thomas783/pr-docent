// Narration with the browser's built-in speech synthesis (no network, no cost).

export function speechAvailable() {
  return typeof speechSynthesis !== "undefined";
}

/** Speaks [text]; resolves when it finishes or is cancelled. */
export async function speak(text, { lang = "ko-KR", rate = 1 } = {}) {
  if (!speechAvailable() || !text) return;
  const voices = await loadVoices();
  return new Promise((resolve) => {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;
    const voice = pickVoice(voices, lang);
    if (voice) utterance.voice = voice;
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

export function stopSpeaking() {
  if (speechAvailable()) speechSynthesis.cancel();
}
