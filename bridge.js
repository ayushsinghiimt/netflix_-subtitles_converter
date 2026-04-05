// bridge.js — runs in ISOLATED world (has chrome.* APIs)
// Acts as a messenger between popup and content_script.js

// 1. On load, send current settings to MAIN world
chrome.storage.local.get(["enabled", "language"], (data) => {
    window.postMessage({
        source: "NETFLIX_SUBS_BRIDGE",
        type: "INIT_SETTINGS",
        enabled: data.enabled ?? false,
        language: data.language ?? "hi",
    }, "*");
});

// 2. Forward popup messages to MAIN world
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SET_ENABLED" || msg.type === "SET_LANGUAGE") {
        window.postMessage({ source: "NETFLIX_SUBS_BRIDGE", ...msg }, "*");
    }
});

// 3. Forward translation status from MAIN world to storage (for popup)
window.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg?.source === "NETFLIX_SUBS_STATUS") {
        chrome.storage.local.set({ translating: msg.type === "TRANSLATING" });
    }
});