(function () {
    const TRANSLATE_API = "https://translation.googleapis.com/language/translate/v2";
    const API_KEY = CONFIG.GOOGLE_API_KEY;
    let TARGET_LANG = "hi";
    let ENABLED = false;

    // Listen for messages from bridge.js (ISOLATED world)
    window.addEventListener("message", (event) => {
        const msg = event.data;
        if (!msg || msg.source !== "NETFLIX_SUBS_BRIDGE") return;

        if (msg.type === "INIT_SETTINGS") {
            ENABLED = msg.enabled;
            TARGET_LANG = msg.language;
            console.log(`[Hindi Subs] Settings loaded — enabled: ${ENABLED}, lang: ${TARGET_LANG}`);
        }
        if (msg.type === "SET_ENABLED") {
            ENABLED = msg.enabled;
            if (!ENABLED) {
                // Clear translation map so DOM observer stops replacing text
                Object.keys(translationMap).forEach(k => delete translationMap[k]);
            }
            console.log(`[Hindi Subs] ${ENABLED ? "Enabled ✓" : "Disabled ✗"}`);
        }
        if (msg.type === "SET_LANGUAGE") {
            TARGET_LANG = msg.language;
            Object.keys(translationMap).forEach(k => delete translationMap[k]);
            console.log(`[Hindi Subs] Language changed to: ${TARGET_LANG}`);
        }
    });

    // Save reference BEFORE we patch anything
    const originalFetch = window.fetch;

    // ── 1. Collect all text nodes from <p> elements in parsed TTML ──
    function collectTextNodes(doc) {
        const nodes = [];
        doc.querySelectorAll("p").forEach(p => {
            const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
                const t = node.textContent.trim();
                if (t) nodes.push(node);
            }
        });
        return nodes;
    }

    // ── 2. Translate using originalFetch (not patched fetch) ───
    const CHUNK_SIZE = 100; // Google limit is 128, keep some margin

    async function translateChunk(texts) {
        const res = await originalFetch(`${TRANSLATE_API}?key=${API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ q: texts, source: "en", target: TARGET_LANG, format: "text" })
        });
        const data = await res.json();
        if (!data.data?.translations) {
            console.error("[Hindi Subs] Translate API error:", data);
            return texts; // return originals as fallback
        }
        return data.data.translations.map(t => t.translatedText);
    }

    async function translateBatch(texts) {
        if (!texts.length) return [];
        const results = [];
        for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
            const chunk = texts.slice(i, i + CHUNK_SIZE);
            console.log(`[Hindi Subs] Translating chunk ${i / CHUNK_SIZE + 1}/${Math.ceil(texts.length / CHUNK_SIZE)}...`);
            const translated = await translateChunk(chunk);
            results.push(...translated);
        }
        return results;
    }

    // ── 3. Main transform — DOM-based, no regex replacement ────
    const translationMap = {}; // EN text → HI text, used by DOM observer

    async function transformToHindi(ttmlStr) {
        window.postMessage({ source: "NETFLIX_SUBS_STATUS", type: "TRANSLATING" }, "*");

        // Parse XML to DOM
        const parser = new DOMParser();
        const doc = parser.parseFromString(ttmlStr, "application/xml");

        // Collect all text nodes from <p> elements
        const textNodes = collectTextNodes(doc);
        const originals = textNodes.map(n => n.textContent.trim());
        const unique = [...new Set(originals)];

        // Translate unique texts
        const translated = await translateBatch(unique);
        const tMap = {};
        unique.forEach((t, i) => { tMap[t] = translated[i]; });

        // Write translations directly back to DOM text nodes
        textNodes.forEach(node => {
            const orig = node.textContent.trim();
            if (tMap[orig]) {
                node.textContent = tMap[orig];
            }
        });

        // Also build translationMap for the DOM observer
        Object.assign(translationMap, tMap);
        console.log("[Hindi Subs] Translation map built:", Object.keys(translationMap).length, "entries");

        window.postMessage({ source: "NETFLIX_SUBS_STATUS", type: "DONE" }, "*");

        // Serialize DOM back to string
        const serializer = new XMLSerializer();
        return serializer.serializeToString(doc);
    }

    // ── 5. DOM Observer — swap subtitle text as Netflix renders it
    function startDOMObserver() {
        const target = document.body;
        const observer = new MutationObserver(() => {
            if (!ENABLED) return; // Don't touch DOM when disabled
            const container = document.querySelector(".player-timedtext");
            if (!container) return;

            // Walk all text nodes inside subtitle container
            const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
                const orig = node.textContent.trim();
                if (orig && translationMap[orig]) {
                    if (node.textContent !== translationMap[orig]) {
                        node.textContent = translationMap[orig];
                    }
                }
            }
        });

        observer.observe(target, { childList: true, subtree: true, characterData: true });
        console.log("[Hindi Subs] DOM observer started ✓");
    }

    // Start observer immediately
    if (document.body) {
        startDOMObserver();
    } else {
        document.addEventListener("DOMContentLoaded", startDOMObserver);
    }

    // ── 5. Is this a full subtitle URL? (not a byte-range chunk)
    function isSubtitleUrl(url) {
        if (!url || !url.includes("?o=")) return false;
        // Chunk URLs have pattern like "0-4095?o=" — skip those
        if (/\d+-\d+\?o=/.test(url)) return false;
        return true;
    }

    // ── 6. Intercept fetch ──────────────────────────────────────
    window.fetch = async function (...args) {
        const url = typeof args[0] === "string" ? args[0] : args[0]?.url;

        if (isSubtitleUrl(url) && ENABLED) {
            console.log("[Hindi Subs] fetch intercepted:", url);
            const response = await originalFetch(...args);
            const clone = response.clone();
            const text = await clone.text();

            if (text.includes("<tt ")) {
                try {
                    const hindi = await transformToHindi(text);
                    console.log("[Hindi Subs] fetch translated ✓");
                    return new Response(hindi, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers,
                    });
                } catch (e) {
                    console.warn("[Hindi Subs] fetch translation failed:", e);
                }
            }
            return response;
        }

        return originalFetch(...args);
    };

    // ── 7. Intercept XHR ────────────────────────────────────────
    const OrigXHR = window.XMLHttpRequest;

    function PatchedXHR() {
        const xhr = new OrigXHR();
        const originalOpen = xhr.open.bind(xhr);
        const originalSend = xhr.send.bind(xhr);
        let isSub = false;

        xhr.open = function (method, url, ...rest) {
            if (isSubtitleUrl(url) && ENABLED) {
                isSub = true;
                console.log("[Hindi Subs] XHR intercepted:", url);
            }
            return originalOpen(method, url, ...rest);
        };

        xhr.send = function (...args) {
            if (isSub) {
                xhr.addEventListener("readystatechange", async function () {
                    if (xhr.readyState !== 4 || xhr.status !== 200) return;
                    try {
                        // Fix: handle arraybuffer responseType
                        // Safely read response regardless of responseType
                        let text;
                        try {
                            text = xhr.responseText; // works if responseType is "" or "text"
                        } catch (e) {
                            text = new TextDecoder("utf-8").decode(xhr.response); // arraybuffer fallback
                        }

                        if (!text || !text.includes("<tt ")) return;

                        const hindi = await transformToHindi(text);
                        const hindiBuffer = new TextEncoder().encode(hindi).buffer;

                        // Override both text and arraybuffer versions
                        Object.defineProperty(xhr, "responseText", { get: () => hindi, configurable: true });
                        Object.defineProperty(xhr, "response", {
                            get: () => xhr.responseType === "arraybuffer" ? hindiBuffer : hindi,
                            configurable: true
                        });
                        console.log("[Hindi Subs] XHR translated ✓");
                        console.log("[Hindi Subs] Sample translations:");
                        // Print first 5 original → hindi pairs
                        const origTexts = extractTexts(text);
                        const hindiTexts = extractTexts(hindi);
                        origTexts.slice(0, 5).forEach((orig, i) => {
                            console.log(`  [${i + 1}] EN: ${orig}`);
                            console.log(`       HI: ${hindiTexts[i]}`);
                        });
                        console.groupCollapsed("[Hindi Subs] Full translated TTML (expand to see)");
                        console.log(hindi);
                        console.groupEnd();
                    } catch (e) {
                        console.warn("[Hindi Subs] XHR translation failed:", e);
                    }
                });
            }
            return originalSend(...args);
        };

        return xhr;
    }

    PatchedXHR.prototype = OrigXHR.prototype;
    window.XMLHttpRequest = PatchedXHR;

    console.log("[Hindi Subs] Interceptor active ✓");
})();