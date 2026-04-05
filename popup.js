const toggle = document.getElementById("toggle");
const language = document.getElementById("language");
const status = document.getElementById("status");
const banner = document.getElementById("reloadBanner");
const btnYes = document.getElementById("btnYes");
const btnNo = document.getElementById("btnNo");

// Load saved settings
chrome.storage.local.get(["enabled", "language", "translating"], (data) => {
    toggle.checked = data.enabled ?? false;
    language.value = data.language ?? "hi";
    updateStatus(toggle.checked, data.translating ?? false);
});

// Listen for real-time translation progress
chrome.storage.onChanged.addListener((changes) => {
    if (changes.translating) {
        const isTranslating = changes.translating.newValue;
        chrome.storage.local.get(["enabled"], (data) => {
            updateStatus(data.enabled ?? false, isTranslating);
        });
    }
});

// Toggle changed
toggle.addEventListener("change", () => {
    const enabled = toggle.checked;
    chrome.storage.local.set({ enabled });
    updateStatus(enabled, false);
    sendToTab({ type: "SET_ENABLED", enabled });

    if (enabled) {
        showBanner(); // only ask to reload when enabling
    } else {
        hideBanner(); // disabling works instantly, no reload needed
    }
});

// Language changed
language.addEventListener("change", () => {
    const lang = language.value;
    chrome.storage.local.set({ language: lang });
    sendToTab({ type: "SET_LANGUAGE", language: lang });
    showBanner();
});

// Banner buttons
btnYes.addEventListener("click", () => {
    hideBanner();
    reloadNetflixTab();
});

btnNo.addEventListener("click", () => {
    hideBanner();
});

function showBanner() {
    banner.classList.add("show");
}

function hideBanner() {
    banner.classList.remove("show");
}

function updateStatus(enabled, translating) {
    if (enabled && translating) {
        status.innerHTML = '<div class="spinner"></div> Translating subtitles…';
        status.className = "status translating";
    } else if (enabled) {
        status.innerHTML = "✓ Translation active";
        status.className = "status on";
    } else {
        status.innerHTML = "Translation disabled";
        status.className = "status off";
    }
}

function sendToTab(msg) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, msg).catch(() => { });
        }
    });
}

function reloadNetflixTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
            chrome.tabs.reload(tabs[0].id);
        }
    });
}