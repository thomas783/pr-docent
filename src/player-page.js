// The panel's video player. Runs as an extension page in an iframe, because GitHub's content
// security policy won't let its own pages play blob: video. Asks the local host (through the
// service worker) for the file named in ?path= and plays it.

const path = new URLSearchParams(location.search).get("path");
const status = document.getElementById("status");
const video = document.getElementById("video");
const parts = [];

const port = chrome.runtime.connect({ name: "video" });
port.onMessage.addListener((message) => {
  if (message.type === "chunk") {
    parts[message.index] = Uint8Array.from(atob(message.data), (c) => c.charCodeAt(0));
  } else if (message.type === "done") {
    port.disconnect();
    video.src = URL.createObjectURL(new Blob(parts, { type: "video/mp4" }));
    status.hidden = true;
    video.hidden = false;
    video.play().catch(() => {}); // autoplay may be refused; the controls are there
  } else if (message.type === "error") {
    status.textContent = message.message;
  }
});
port.postMessage({ path });
