// Narration with the browser's built-in speech synthesis (no network, no cost).

export function speechAvailable() {
  return typeof speechSynthesis !== "undefined";
}

/** Speaks [text]; resolves when it finishes or is cancelled. */
export function speak(text, { lang = "ko-KR", rate = 1 } = {}) {
  return new Promise((resolve) => {
    if (!speechAvailable() || !text) return resolve();
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;
    const voice = speechSynthesis.getVoices().find((v) => v.lang?.startsWith(lang.slice(0, 2)));
    if (voice) utterance.voice = voice;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking() {
  if (speechAvailable()) speechSynthesis.cancel();
}
