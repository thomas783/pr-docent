// Content scripts can't be ES modules, so this classic script imports the real entry point.
(async () => {
  const { start } = await import(chrome.runtime.getURL("src/main.js"));
  start();
})();
