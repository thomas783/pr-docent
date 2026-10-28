// The panel's short player. Runs as an extension page in an iframe over GitHub, and plays the
// short stored under ?short=<chrome.storage key> live from its script.

import { playShort } from "./short-player.js";

const status = document.getElementById("status");
playShort(document.getElementById("short"), new URLSearchParams(location.search).get("short")).catch((error) => {
  status.hidden = false;
  status.textContent = error.message;
});
