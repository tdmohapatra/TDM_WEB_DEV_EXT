/* ============================================================
   Multi-Provider AI Chatbot Widget — Gemini / Groq / OpenAI
   Fully isolated in Shadow DOM with chrome.storage.local
   ============================================================ */
(function () {
    "use strict";
    if (typeof location !== 'undefined' && location.protocol !== 'chrome-extension:') return;
    if (window.__multiAiWidgetInjectedV3) return;
    window.__multiAiWidgetInjectedV3 = true;

    /* ---------------------------------------------------------
       CONFIG & STORAGE KEYS
       --------------------------------------------------------- */
    const STORAGE_KEYS = {
        CONFIG:     "app_ai_config_v3",
        SESSIONS:   "app_ai_sessions_v3",
        ACTIVE:     "app_ai_active_v3",
        USAGE:      "app_ai_usage_v3",
        USAGE_LOGS: "app_ai_usage_history_v3",
        MEMORY:     "app_ai_memory_v3"
    };

    const PROVIDER_MODELS = {
        gemini: [
            { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash (Recommended - Active)" },
            { id: "gemini-3.8-pro", name: "Gemini 3.8 Pro (Deep Reasoning)" },
            { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
            { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
            { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
            { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash (Legacy)" }
        ],
        groq: [
            { id: "qwen/qwen3.8-27b", name: "Qwen 3.8 27B (Recommended - Active)" },
            { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant (Ultra Fast)" },
            { id: "llama-3.1-70b-versatile", name: "Llama 3.1 70B Versatile" },
            { id: "meta-llama/llama-prompt-guard-2-86m", name: "Llama Prompt Guard 2 86M" },
            { id: "meta-llama/llama-prompt-guard-2-22m", name: "Llama Prompt Guard 2 22M" },
            { id: "deepseek-r1-distill-llama-70b", name: "DeepSeek R1 Distill 70B" },
            { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B" },
            { id: "gemma2-9b-it", name: "Gemma 2 9B IT" }
        ],
        openai: [
            { id: "gpt-4o-mini", name: "GPT-4o Mini (Recommended)" },
            { id: "gpt-4o", name: "GPT-4o (Omni)" },
            { id: "gpt-4-turbo", name: "GPT-4 Turbo" }
        ]
    };

    const DEFAULT_CONFIG = {
        activeProvider: "gemini",
        includeMemory: true,
        keys: {
            gemini: "",
            groq: "",
            openai: ""
        },
        models: {
            gemini: "gemini-3.8-flash",
            groq: "qwen/qwen3.8-27b",
            openai: "gpt-4o-mini"
        },
        systemPrompt: "You are a careful browser and web-development debugging assistant. Use the supplied page and network evidence, distinguish facts from hypotheses, explain likely causes, and give concrete next steps. Keep responses concise but useful; use headings and short lists when they improve clarity. Never claim to have inspected data that was not supplied.",
        rateLimitPerMin: 20,
        dailyLimit: 2000
    };

    /* ---------------------------------------------------------
       ASYNC CHROME STORAGE HELPERS (Strictly Local Storage)
       --------------------------------------------------------- */
    function storageGet(key) {
        return new Promise((resolve) => {
            try {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.get(key, (d) => resolve(d?.[key] ?? null));
                } else {
                    const raw = localStorage.getItem(key);
                    resolve(raw ? JSON.parse(raw) : null);
                }
            } catch (_) { resolve(null); }
        });
    }

    function storageSet(key, val) {
        return new Promise((resolve) => {
            try {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({ [key]: val }, resolve);
                } else {
                    localStorage.setItem(key, JSON.stringify(val));
                    resolve();
                }
            } catch (_) { resolve(); }
        });
    }

    let config = { ...DEFAULT_CONFIG };
    let sessions = [];
    let activeSessionId = null;
    let memory = [];
    let usage = { day: "", requestsToday: 0, tokensToday: 0, allTimeRequests: 0, allTimeTokens: 0, minuteTimestamps: [] };
    let usageHistory = {};
    let currentMemFilter = "all";
    let currentUsageRange = "today";
    let isWaiting = false;

    async function loadAllState() {
        const cfg = await storageGet(STORAGE_KEYS.CONFIG);
        if (cfg) {
            config = {
                ...DEFAULT_CONFIG,
                ...cfg,
                keys: { ...DEFAULT_CONFIG.keys, ...(cfg.keys || {}) },
                models: { ...DEFAULT_CONFIG.models, ...(cfg.models || {}) }
            };
        }
        const s = await storageGet(STORAGE_KEYS.SESSIONS);
        if (Array.isArray(s)) sessions = s;
        activeSessionId = await storageGet(STORAGE_KEYS.ACTIVE);
        const mem = await storageGet(STORAGE_KEYS.MEMORY);
        if (Array.isArray(mem)) memory = mem;

        const u = await storageGet(STORAGE_KEYS.USAGE);
        if (u) usage = u;

        const uh = await storageGet(STORAGE_KEYS.USAGE_LOGS);
        if (uh && typeof uh === "object") usageHistory = uh;

        checkDailyReset();
    }

    function saveConfig() { storageSet(STORAGE_KEYS.CONFIG, config); }
    function saveSessions() { storageSet(STORAGE_KEYS.SESSIONS, sessions); }
    function saveUsageData() { storageSet(STORAGE_KEYS.USAGE, usage); }

    function todayKey(ts) {
        const d = ts ? new Date(ts) : new Date();
        return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }

    function getWeekKey(ts) {
        const dt = new Date(ts || Date.now());
        dt.setHours(0, 0, 0, 0);
        dt.setDate(dt.getDate() + 4 - (dt.getDay() || 7));
        const yearStart = new Date(dt.getFullYear(), 0, 1);
        const weekNo = Math.ceil((((dt - yearStart) / 86400000) + 1) / 7);
        return dt.getFullYear() + "-W" + String(weekNo).padStart(2, "0");
    }

    function getMonthKey(ts) {
        const dt = new Date(ts || Date.now());
        return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0");
    }

    function formatDateLabel(dateStr) {
        if (!dateStr) return "Unknown Date";
        try {
            const parts = dateStr.split("-");
            if (parts.length === 3) {
                const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
            }
        } catch (_) {}
        return dateStr;
    }

    function formatMonthLabel(monthStr) {
        if (!monthStr) return "Unknown Month";
        try {
            const parts = monthStr.split("-");
            if (parts.length === 2) {
                const d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
                return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
            }
        } catch (_) {}
        return monthStr;
    }

    /* ---------------------------------------------------------
       MARKDOWN RENDERER
       --------------------------------------------------------- */
    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function inlineFmt(s) {
        const inlines = [];
        s = s.replace(/`([^`\n]+)`/g, (m, code) => {
            const i = inlines.length;
            inlines.push(code);
            return "\u0003INL" + i + "\u0003";
        });
        s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
        s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        s = s.replace(/\u0003INL(\d+)\u0003/g, (m, i) => '<code class="gcb-inline-code">' + inlines[parseInt(i, 10)] + "</code>");
        return s;
    }

    function renderMarkdown(text) {
        if (!text) return "";
        const codeBlocks = [];
        let s = escapeHtml(text);

        s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, lang, code) => {
            const i = codeBlocks.length;
            codeBlocks.push({ lang: lang || "", code: code.replace(/\n$/, "") });
            return "\u0000CODE" + i + "\u0000";
        });

        const lines = s.split("\n");
        const out = [];
        let listType = null;

        function closeList() { if (listType) { out.push("</" + listType + ">"); listType = null; } }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/^\u0000CODE\d+\u0000$/.test(line.trim())) {
                closeList(); out.push(line.trim()); continue;
            }
            let m = line.match(/^(#{1,3})\s+(.+)$/);
            if (m) {
                closeList();
                const lvl = m[1].length;
                out.push("<h" + lvl + ">" + inlineFmt(m[2]) + "</h" + lvl + ">");
                continue;
            }
            m = line.match(/^\s*[-*]\s+(.+)$/);
            if (m) {
                if (listType !== "ul") { closeList(); out.push("<ul>"); listType = "ul"; }
                out.push("<li>" + inlineFmt(m[1]) + "</li>");
                continue;
            }
            m = line.match(/^\s*\d+\.\s+(.+)$/);
            if (m) {
                if (listType !== "ol") { closeList(); out.push("<ol>"); listType = "ol"; }
                out.push("<li>" + inlineFmt(m[1]) + "</li>");
                continue;
            }
            closeList();
            if (line.trim() === "") { out.push(""); continue; }
            out.push(inlineFmt(line));
        }
        closeList();

        let result = "";
        for (let i = 0; i < out.length; i++) {
            const line = out[i];
            if (line === "") { if (result && !result.endsWith("\n\n")) result += "\n"; continue; }
            const isBlock = /^<(\/?)(h[1-3]|ul|ol|li|pre)|\u0000CODE\d+\u0000/.test(line);
            result += isBlock ? line + "\n" : line + "<br>\n";
        }
        result = result.replace(/<br>\s*\n?$/, "");
        result = result.replace(/\u0000CODE(\d+)\u0000/g, (m, i) => {
            const cb = codeBlocks[parseInt(i, 10)];
            const lang = escapeHtml(cb.lang || "code");
            const codeRaw = escapeHtml(cb.code);
            return `<div class="gcb-code-box"><div class="gcb-code-header"><span class="gcb-code-lang">${lang}</span><button class="gcb-code-copy" type="button">📋 Copy</button></div><pre><code>${codeRaw}</code></pre></div>`;
        });

        return result;
    }

    /* ---------------------------------------------------------
       HOST & SHADOW DOM
       --------------------------------------------------------- */
    const host = document.createElement("div");
    host.id = "groq-chat-widget-host";
    host.style.cssText = "all: initial; position: fixed; z-index: 2147483647;";
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });

    const styleEl = document.createElement("style");
    styleEl.textContent = `
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
        
        @keyframes gcbPulse {
            0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.6), 0 12px 28px -6px rgba(0, 0, 0, 0.5); }
            70% { box-shadow: 0 0 0 16px rgba(99, 102, 241, 0), 0 12px 28px -6px rgba(0, 0, 0, 0.5); }
            100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0), 0 12px 28px -6px rgba(0, 0, 0, 0.5); }
        }
        @keyframes gcbFadeUp {
            from { opacity: 0; transform: translateY(12px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes gcbBounce {
            0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
            40% { transform: translateY(-5px); opacity: 1; }
        }

        .gcb-toggle {
            display: none !important;
        }
        .gcb-toggle:hover { transform: scale(1.1) rotate(-8deg); background: linear-gradient(135deg, #4f46e5, #2563eb, #1e40af); }
        .gcb-toggle .gcb-badge {
            position: absolute; top: -3px; right: -3px; background: #ef4444; color: white; font-size: 0.62rem;
            font-weight: 800; padding: 2px 7px; border-radius: 10px; border: 2px solid #0b0f1a; display: none;
        }
        .gcb-toggle .gcb-badge.show { display: block; }

        .gcb-panel {
            position: fixed; bottom: 104px; right: 28px; width: 450px; max-width: calc(100vw - 32px);
            height: 680px; max-height: calc(100vh - 120px); background: rgba(10, 14, 26, 0.96); backdrop-filter: blur(24px) saturate(180%);
            border-radius: 22px; border: 1px solid rgba(99, 102, 241, 0.3); box-shadow: 0 32px 80px -16px rgba(0, 0, 0, 0.9), 0 0 40px rgba(99, 102, 241, 0.15);
            display: flex; flex-direction: column; overflow: hidden; opacity: 0; visibility: hidden;
            transform: translateY(24px) scale(0.95); transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1); pointer-events: none;
        }
        .gcb-panel.open { opacity: 1; visibility: visible; transform: translateY(0) scale(1); pointer-events: all; }
        .gcb-panel.minimized {
            height: 220px !important;
            min-height: 220px !important;
            max-height: 220px !important;
            border-radius: 14px !important;
            box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6) !important;
        }
        .gcb-panel.minimized .gcb-header {
            padding: 8px 12px !important;
        }
        .gcb-panel.minimized .gcb-messages {
            display: flex !important;
            max-height: 120px !important;
            padding: 8px 12px !important;
            gap: 8px !important;
        }
        .gcb-panel.minimized .gcb-input-area {
            display: flex !important;
            padding: 6px 10px !important;
        }
        .gcb-panel.minimized .gcb-usage-bar,
        .gcb-panel.minimized .gcb-overlay {
            display: none !important;
        }

        .gcb-bubble, .gcb-messages, .gcb-code-box {
            user-select: text !important;
            -webkit-user-select: text !important;
        }

        .gcb-header {
            display: flex; align-items: center; justify-content: space-between; padding: 14px 18px;
            background: linear-gradient(180deg, rgba(17, 24, 39, 0.95), rgba(10, 14, 26, 0.9)); border-bottom: 1px solid rgba(99, 102, 241, 0.2); flex-shrink: 0;
            cursor: grab; user-select: none;
        }
        .gcb-header:active { cursor: grabbing; }
        .gcb-header-left { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
        .gcb-status-dot { width: 9px; height: 9px; background: #10b981; border-radius: 50%; box-shadow: 0 0 12px #10b981; flex-shrink: 0; }
        .gcb-header h3 { font-size: 1.02rem; font-weight: 700; background: linear-gradient(135deg, #a5b4fc, #60a5fa, #38bdf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: -0.01em; }
        .gcb-model-badge { font-size: 0.62rem; font-weight: 600; padding: 3px 10px; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(129, 140, 248, 0.35); border-radius: 40px; color: #a5b4fc; text-transform: uppercase; letter-spacing: 0.03em; }
        
        .gcb-header-actions { display: flex; gap: 5px; }
        .gcb-icon-btn { background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8; width: 32px; height: 32px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; transition: all 0.2s ease; }
        .gcb-icon-btn:hover { background: rgba(99, 102, 241, 0.2); border-color: rgba(129, 140, 248, 0.4); color: #f8fafc; transform: translateY(-1px); }

        .gcb-usage-bar { padding: 8px 18px; background: rgba(6, 9, 18, 0.8); border-bottom: 1px solid rgba(99, 102, 241, 0.12); display: flex; align-items: center; justify-content: space-between; font-size: 0.68rem; color: #64748b; flex-shrink: 0; }
        .gcb-usage-pill { padding: 3px 10px; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 20px; color: #818cf8; font-weight: 600; }

        .gcb-messages { flex: 1; overflow-y: auto; padding: 18px; display: flex; flex-direction: column; gap: 14px; scroll-behavior: smooth; }
        .gcb-messages::-webkit-scrollbar { width: 5px; }
        .gcb-messages::-webkit-scrollbar-track { background: rgba(6, 9, 18, 0.4); }
        .gcb-messages::-webkit-scrollbar-thumb { background: rgba(99, 102, 241, 0.3); border-radius: 10px; }
        .gcb-messages::-webkit-scrollbar-thumb:hover { background: rgba(99, 102, 241, 0.6); }

        .gcb-msg { display: flex; gap: 10px; max-width: 92%; animation: gcbFadeUp 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
        .gcb-msg.user { align-self: flex-end; flex-direction: row-reverse; }
        .gcb-msg.bot { align-self: flex-start; }
        
        .gcb-avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; flex-shrink: 0; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3); }
        .gcb-msg.user .gcb-avatar { background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; }
        .gcb-msg.bot .gcb-avatar { background: linear-gradient(135deg, #312e81, #1e1b4b); color: #818cf8; border: 1px solid rgba(129, 140, 248, 0.3); }

        .gcb-bubble { background: rgba(22, 30, 48, 0.85); padding: 12px 16px; border-radius: 16px; font-size: 0.88rem; line-height: 1.55; color: #f1f5f9; border: 1px solid rgba(99, 102, 241, 0.2); word-break: break-word; box-shadow: 0 4px 16px rgba(0,0,0,0.3); }
        .gcb-msg.user .gcb-bubble { background: linear-gradient(135deg, #2563eb, #1d4ed8); border-color: rgba(96, 165, 250, 0.4); color: #ffffff; border-bottom-right-radius: 4px; }
        .gcb-msg.bot .gcb-bubble { border-left: 3px solid #6366f1; border-bottom-left-radius: 4px; }

        /* Code box */
        .gcb-code-box { margin: 10px 0; border-radius: 10px; border: 1px solid rgba(99, 102, 241, 0.25); background: #070a13; overflow: hidden; }
        .gcb-code-header { display: flex; align-items: center; justify-content: space-between; padding: 6px 12px; background: rgba(15, 23, 42, 0.9); border-bottom: 1px solid rgba(99, 102, 241, 0.15); font-size: 0.72rem; color: #94a3b8; font-family: monospace; }
        .gcb-code-copy { background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(129, 140, 248, 0.3); border-radius: 6px; color: #a5b4fc; padding: 3px 8px; font-size: 0.68rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .gcb-code-copy:hover { background: rgba(99, 102, 241, 0.3); color: #ffffff; }
        .gcb-code-box pre { padding: 12px; overflow-x: auto; font-family: 'Consolas', 'Fira Code', monospace; font-size: 0.8rem; color: #e2e8f0; line-height: 1.45; }

        /* Quick chips */
        .gcb-quick-chips { background: rgba(15, 23, 42, 0.6); border: 1px dashed rgba(99, 102, 241, 0.25); border-radius: 14px; padding: 12px; margin-top: 6px; }
        .gcb-chip-title { font-size: 0.72rem; font-weight: 700; color: #818cf8; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px; }
        .gcb-chips-row { display: flex; flex-wrap: wrap; gap: 6px; }
        .gcb-chip { background: rgba(99, 102, 241, 0.12); border: 1px solid rgba(129, 140, 248, 0.28); border-radius: 20px; color: #cbd5e1; padding: 6px 12px; font-size: 0.74rem; font-weight: 500; cursor: pointer; transition: all 0.2s ease; text-align: left; }
        .gcb-chip:hover { background: rgba(99, 102, 241, 0.25); border-color: #818cf8; color: #ffffff; transform: translateY(-1px); }

        /* Typing indicator */
        .gcb-typing-bubble { display: flex; align-items: center; gap: 8px; color: #94a3b8; font-size: 0.82rem; }
        .gcb-dots span { display: inline-block; animation: gcbBounce 1.4s infinite ease-in-out both; font-weight: bold; font-size: 1.1rem; color: #818cf8; }
        .gcb-dots span:nth-child(1) { animation-delay: -0.32s; }
        .gcb-dots span:nth-child(2) { animation-delay: -0.16s; }

        /* Input Area */
        .gcb-input-area { padding: 14px 18px; background: rgba(6, 9, 18, 0.95); border-top: 1px solid rgba(99, 102, 241, 0.2); display: flex; gap: 10px; align-items: center; }
        .gcb-input-area input { flex: 1; background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(99, 102, 241, 0.35); border-radius: 50px; padding: 11px 18px; font-size: 0.88rem; color: #f8fafc; outline: none; transition: all 0.2s ease; }
        .gcb-input-area input:focus { border-color: #6366f1; box-shadow: 0 0 16px rgba(99, 102, 241, 0.35); background: rgba(15, 23, 42, 1); }
        .gcb-send-btn { background: linear-gradient(135deg, #4f46e5, #2563eb); border: none; border-radius: 50px; padding: 11px 22px; color: white; font-weight: 700; font-size: 0.85rem; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4); display: flex; align-items: center; gap: 6px; }
        .gcb-send-btn:hover { background: linear-gradient(135deg, #4338ca, #1d4ed8); transform: translateY(-1px); box-shadow: 0 6px 18px rgba(79, 70, 229, 0.6); }

        /* Settings Overlay */
        .gcb-overlay { position: absolute; inset: 0; background: rgba(6, 9, 18, 0.94); backdrop-filter: blur(16px); display: none; align-items: center; justify-content: center; padding: 18px; z-index: 100; border-radius: 22px; overflow-y: auto; animation: gcbFadeUp 0.2s ease; }
        .gcb-overlay.open { display: flex; }
        .gcb-card { width: 100%; max-width: 400px; background: rgba(15, 23, 42, 0.98); border: 1px solid rgba(99, 102, 241, 0.4); border-radius: 20px; padding: 22px; display: flex; flex-direction: column; gap: 14px; box-shadow: 0 20px 50px rgba(0,0,0,0.8); }
        .gcb-card h4 { font-size: 1.05rem; font-weight: 700; color: #f8fafc; text-align: center; background: linear-gradient(135deg, #a5b4fc, #60a5fa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .gcb-card label { font-size: 0.7rem; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 5px; display: block; }
        .gcb-card input, .gcb-card select, .gcb-card textarea { width: 100%; background: rgba(6, 9, 18, 0.95); border: 1px solid rgba(99, 102, 241, 0.35); border-radius: 10px; padding: 10px 14px; font-size: 0.85rem; color: #f8fafc; outline: none; transition: all 0.2s; }
        .gcb-card input:focus, .gcb-card select:focus, .gcb-card textarea:focus { border-color: #6366f1; box-shadow: 0 0 12px rgba(99, 102, 241, 0.3); }
        .gcb-card select option { background: #0f172a; color: #f8fafc; }
        .gcb-actions { display: flex; gap: 10px; margin-top: 6px; }
        .gcb-btn-p, .gcb-btn-s { flex: 1; padding: 11px 16px; border-radius: 10px; font-size: 0.82rem; font-weight: 700; cursor: pointer; border: none; transition: all 0.2s; }
        .gcb-btn-p { background: linear-gradient(135deg, #4f46e5, #2563eb); color: white; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4); }
        .gcb-btn-p:hover { background: linear-gradient(135deg, #4338ca, #1d4ed8); transform: translateY(-1px); }
        .gcb-btn-s { background: rgba(255, 255, 255, 0.06); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.12); }
        .gcb-btn-s:hover { background: rgba(255, 255, 255, 0.12); color: white; }
        .gcb-err { color: #f87171; font-size: 0.75rem; text-align: center; min-height: 16px; font-weight: 500; }
        .gcb-info { font-size: 0.68rem; color: #64748b; line-height: 1.45; text-align: center; }
        .gcb-session-actions { display: flex; gap: 8px; margin-bottom: 6px; }
        .gcb-sessions-list { max-height: 280px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px; }
        .gcb-session-item { background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(99, 102, 241, 0.25); border-radius: 12px; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; transition: all 0.2s; }
        .gcb-session-item:hover { background: rgba(99, 102, 241, 0.2); border-color: rgba(129, 140, 248, 0.5); }
        .gcb-session-item.active { border-color: #6366f1; background: rgba(99, 102, 241, 0.25); }
        .gcb-session-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
        .gcb-session-title { font-size: 0.82rem; font-weight: 600; color: #f8fafc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .gcb-session-meta { font-size: 0.68rem; color: #94a3b8; display: flex; gap: 8px; align-items: center; }
        .gcb-session-del { background: transparent; border: none; color: #94a3b8; font-size: 0.85rem; cursor: pointer; padding: 4px 6px; border-radius: 6px; }
        .gcb-session-del:hover { background: rgba(239, 68, 68, 0.2); color: #f87171; }
        
        .gcb-usage-stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 8px 0; }
        .gcb-stat-item { background: rgba(6, 9, 18, 0.8); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 12px; padding: 12px; text-align: center; display: flex; flex-direction: column; gap: 2px; }
        .gcb-stat-val { font-size: 1.2rem; font-weight: 800; color: #818cf8; }
        .gcb-stat-lbl { font-size: 0.65rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.04em; }

        .gcb-filter-bar { display: flex; gap: 4px; margin: 8px 0; background: rgba(6, 9, 18, 0.8); padding: 4px; border-radius: 10px; border: 1px solid rgba(99, 102, 241, 0.2); }
        .gcb-filter-btn { flex: 1; padding: 6px 4px; background: transparent; border: none; color: #94a3b8; font-size: 0.68rem; font-weight: 600; border-radius: 6px; cursor: pointer; transition: all 0.2s; text-align: center; }
        .gcb-filter-btn:hover { background: rgba(99, 102, 241, 0.15); color: #cbd5e1; }
        .gcb-filter-btn.active { background: rgba(99, 102, 241, 0.28); color: #818cf8; border: 1px solid rgba(129, 140, 248, 0.4); }
        .gcb-group-header { font-size: 0.72rem; font-weight: 700; color: #818cf8; margin: 10px 0 4px 0; padding-bottom: 4px; border-bottom: 1px solid rgba(99, 102, 241, 0.2); text-transform: uppercase; letter-spacing: 0.04em; text-align: left; }

        /* Animated Sparkle Icon */
        .gcb-sparkle-svg { width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 2; animation: gcbSpin 12s linear infinite; }
        @keyframes gcbSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    `;
    shadow.appendChild(styleEl);

    /* ---------------------------------------------------------
       MARKUP
       --------------------------------------------------------- */
    const root = document.createElement("div");
    root.innerHTML = `
        <button class="gcb-toggle" id="gcbToggle" title="Open Multi-AI Assistant">
            <svg class="gcb-sparkle-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="currentColor"/>
            </svg>
            <span class="gcb-badge" id="gcbBadge">0</span>
        </button>
        <div class="gcb-panel" id="gcbPanel">
            <div class="gcb-header">
                <div class="gcb-header-left">
                    <button class="gcb-icon-btn" id="gcbSessionsBtn" title="Chat Sessions History">💬</button>
                    <div class="gcb-status-dot" title="AI Ready"></div>
                    <h3 id="gcbTitle">Multi-AI Assistant</h3>
                    <span class="gcb-model-badge" id="gcbModelBadge">gemini-3.8-flash</span>
                </div>
                <div class="gcb-header-actions">
                    <button class="gcb-icon-btn" id="gcbMinimizeBtn" title="Minimize Chatbot Panel to Small Height Bar">_</button>
                    <button class="gcb-icon-btn" id="gcbClearBtn" title="Clear Chat History">🗑️</button>
                    <button class="gcb-icon-btn" id="gcbSettingsBtn" title="AI Provider & API Settings">⚙️</button>
                    <button class="gcb-icon-btn" id="gcbCloseBtn" title="Close Panel">✕</button>
                </div>
            </div>
            <div class="gcb-usage-bar">
                <span class="gcb-usage-pill" id="gcbBarReq">📅 Ready</span>
                <span class="gcb-usage-pill" id="gcbBarTok">🔒 Secure Local Keys</span>
            </div>
            <div class="gcb-messages" id="gcbMessages"></div>
            <div class="gcb-input-area">
                <button class="gcb-icon-btn" id="gcbMemoryToggle" title="Toggle Past Session Memory (OFF = saves tokens)" style="width:auto; padding:0 8px; font-size:0.72rem; font-weight:600; color:#a5b4fc; white-space:nowrap;">🧠 Memory: ON</button>
                <input type="text" id="gcbInput" placeholder="Ask AI anything..." autocomplete="off" />
                <button class="gcb-send-btn" id="gcbSend">Send ➤</button>
            </div>
            <div class="gcb-overlay" id="gcbOverlay">
                <!-- High Token Warning Card -->
                <div class="gcb-card" id="gcbTokenWarnForm" style="display:none;">
                    <h4 style="color:#f59e0b;">⚠️ High Token Warning</h4>
                    <div class="gcb-info" id="gcbTokenWarnText" style="margin-bottom:12px; font-size:0.82rem; color:#fde68a; line-height:1.5;"></div>
                    <div class="gcb-actions">
                        <button class="gcb-btn-s" id="gcbTokenWarnCancel">Cancel Prompt</button>
                        <button class="gcb-btn-p" id="gcbTokenWarnSend" style="background:linear-gradient(135deg, #ea580c, #c2410c);">Send Anyway 🚀</button>
                    </div>
                </div>
                <!-- Security Lock Form -->
                <div class="gcb-card" id="gcbLockForm" style="display:none;">
                    <h4>🔒 Security Settings Lock</h4>
                    <div class="gcb-info" style="margin-bottom:6px;">Type "TDM" and select Today's calendar date to unlock Settings.</div>
                    <div>
                        <label>Text Code (Must type "TDM")</label>
                        <input type="text" id="gcbLockText" placeholder="Type TDM here..." autocomplete="off" />
                    </div>
                    <div>
                        <label>Password Date (Select from Calendar)</label>
                        <input type="date" id="gcbLockDate" />
                    </div>
                    <div class="gcb-err" id="gcbLockError"></div>
                    <div class="gcb-actions">
                        <button class="gcb-btn-s" id="gcbLockCancel">Cancel</button>
                        <button class="gcb-btn-p" id="gcbLockSubmit">Unlock Settings 🔓</button>
                    </div>
                </div>

                <!-- Sessions List Card -->
                <div class="gcb-card" id="gcbSessionsForm" style="display:none;">
                    <h4>💬 Chat Sessions &amp; Memory</h4>
                    <div class="gcb-session-actions">
                        <button class="gcb-btn-p" id="gcbNewSessionBtn">➕ New Chat</button>
                        <button class="gcb-btn-s" id="gcbShowUsageBtn">📊 Usage Stats</button>
                    </div>
                    <div class="gcb-filter-bar">
                        <button class="gcb-filter-btn gcb-mem-filter-btn active" data-mode="all">💬 Sessions</button>
                        <button class="gcb-filter-btn gcb-mem-filter-btn" data-mode="date">📅 Date-wise</button>
                        <button class="gcb-filter-btn gcb-mem-filter-btn" data-mode="week">🗓️ Week-wise</button>
                        <button class="gcb-filter-btn gcb-mem-filter-btn" data-mode="month">📊 Month-wise</button>
                    </div>
                    <div class="gcb-sessions-list" id="gcbSessionsList"></div>
                    <div class="gcb-actions">
                        <button class="gcb-btn-s" id="gcbClearAllSessionsBtn" style="color:#f87171;">🗑️ Clear All Sessions</button>
                        <button class="gcb-btn-s" id="gcbSessionsCancel">Close</button>
                    </div>
                </div>

                <!-- Usage Statistics Card -->
                <div class="gcb-card" id="gcbUsageForm" style="display:none;">
                    <h4 id="gcbUsageHeading">📊 Unified AI Usage Statistics</h4>
                    <div class="gcb-filter-bar">
                        <button class="gcb-filter-btn gcb-usage-range-btn active" data-range="today">Today</button>
                        <button class="gcb-filter-btn gcb-usage-range-btn" data-range="week">This Week</button>
                        <button class="gcb-filter-btn gcb-usage-range-btn" data-range="month">This Month</button>
                        <button class="gcb-filter-btn gcb-usage-range-btn" data-range="all">All-Time</button>
                    </div>
                    <div class="gcb-usage-stats-grid">
                        <div class="gcb-stat-item"><span class="gcb-stat-val" id="gcbStatTodayReq">0</span><span class="gcb-stat-lbl">Requests</span></div>
                        <div class="gcb-stat-item"><span class="gcb-stat-val" id="gcbStatTodayTok">0</span><span class="gcb-stat-lbl">Tokens Used</span></div>
                        <div class="gcb-stat-item"><span class="gcb-stat-val" id="gcbStatTotalReq">0</span><span class="gcb-stat-lbl">All-Time Req</span></div>
                        <div class="gcb-stat-item"><span class="gcb-stat-val" id="gcbStatTotalTok">0</span><span class="gcb-stat-lbl">All-Time Tok</span></div>
                    </div>
                    <div class="gcb-info" id="gcbUsageProviderInfo">Active Provider: Gemini</div>
                    <div class="gcb-actions">
                        <button class="gcb-btn-s" id="gcbUsageCancel">Close</button>
                    </div>
                </div>

                <!-- Settings -->
                <div class="gcb-card" id="gcbSettingsForm" style="display:none;">
                    <h4>⚙️ Multi-AI Configuration</h4>
                    <div>
                        <label>AI Provider</label>
                        <select id="gcbProviderSelect">
                            <option value="gemini">Google Gemini AI</option>
                            <option value="groq">Groq AI (Ultra Fast)</option>
                            <option value="openai">OpenAI (ChatGPT)</option>
                        </select>
                    </div>
                    <div>
                        <label>Active Model</label>
                        <select id="gcbModelSelect"></select>
                    </div>
                    <div id="gcbCustomModelSection" style="display:none; margin-top:6px;">
                        <label>Custom Model Identifier</label>
                        <input type="text" id="gcbCustomModelInput" placeholder="e.g. qwen/qwen3.8-27b or meta-llama/..." />
                    </div>
                    <div id="gcbKeySectionGemini">
                        <label>Google Gemini API Key</label>
                        <input type="password" id="gcbGeminiKey" placeholder="AIzaSy..." />
                        <span class="gcb-key-status" id="gcbGeminiStatus"></span>
                    </div>
                    <div id="gcbKeySectionGroq" style="display:none;">
                        <label>Groq API Key</label>
                        <input type="password" id="gcbGroqKey" placeholder="gsk_..." />
                        <span class="gcb-key-status" id="gcbGroqStatus"></span>
                    </div>
                    <div id="gcbKeySectionOpenAI" style="display:none;">
                        <label>OpenAI API Key</label>
                        <input type="password" id="gcbOpenAIKey" placeholder="sk-..." />
                        <span class="gcb-key-status" id="gcbOpenAIStatus"></span>
                    </div>
                    <div>
                        <label>System Prompt</label>
                        <textarea id="gcbSystemPrompt" rows="3"></textarea>
                    </div>
                    <div class="gcb-err" id="gcbSettingsError"></div>
                    <div class="gcb-actions">
                        <button class="gcb-btn-s" id="gcbSettingsCancel">Cancel</button>
                        <button class="gcb-btn-p" id="gcbSettingsSave">Save Settings</button>
                    </div>
                    <div class="gcb-info">Keys are stored securely in Chrome Extension Storage and persist until manually deleted.</div>
                </div>
            </div>
        </div>
    `;
    shadow.appendChild(root);

    /* ---------------------------------------------------------
    /* ---------------------------------------------------------
       DOM REFS & EVENT BINDINGS
       --------------------------------------------------------- */
    const $ = (id) => shadow.getElementById(id);
    const toggleBtn = $("gcbToggle");
    const panel = $("gcbPanel");
    const messagesEl = $("gcbMessages");
    const userInput = $("gcbInput");
    const sendBtn = $("gcbSend");
    const popoutBtn = $("gcbPopoutBtn");
    const minimizeBtn = $("gcbMinimizeBtn");
    const closeBtn = $("gcbCloseBtn");
    const clearBtn = $("gcbClearBtn");
    const settingsBtn = $("gcbSettingsBtn");
    const sessionsBtn = $("gcbSessionsBtn");
    const modelBadge = $("gcbModelBadge");
    const overlay = $("gcbOverlay");
    const settingsForm = $("gcbSettingsForm");
    const providerSelect = $("gcbProviderSelect");
    const modelSelect = $("gcbModelSelect");
    const geminiKeyInput = $("gcbGeminiKey");
    const groqKeyInput = $("gcbGroqKey");
    const openaiKeyInput = $("gcbOpenAIKey");
    const geminiStatus = $("gcbGeminiStatus");
    const groqStatus = $("gcbGroqStatus");
    const openaiStatus = $("gcbOpenAIStatus");
    const sysPromptInput = $("gcbSystemPrompt");
    const settingsSave = $("gcbSettingsSave");
    const settingsCancel = $("gcbSettingsCancel");

    const lockForm = $("gcbLockForm");
    const lockText = $("gcbLockText");
    const lockDate = $("gcbLockDate");
    const lockError = $("gcbLockError");
    const lockSubmit = $("gcbLockSubmit");
    const lockCancel = $("gcbLockCancel");

    const sessionsForm = $("gcbSessionsForm");
    const sessionsList = $("gcbSessionsList");
    const newSessionBtn = $("gcbNewSessionBtn");
    const showUsageBtn = $("gcbShowUsageBtn");
    const clearAllSessionsBtn = $("gcbClearAllSessionsBtn");
    const sessionsCancel = $("gcbSessionsCancel");

    const usageForm = $("gcbUsageForm");
    const usageCancel = $("gcbUsageCancel");

    const memoryToggleBtn = $("gcbMemoryToggle");
    const tokenWarnForm = $("gcbTokenWarnForm");
    const tokenWarnText = $("gcbTokenWarnText");
    const tokenWarnCancel = $("gcbTokenWarnCancel");
    const tokenWarnSend = $("gcbTokenWarnSend");

    function renderModelOptions(provider, selectedModel) {
        const list = PROVIDER_MODELS[provider] || [];
        const isKnown = list.some(m => m.id === selectedModel);
        let opts = list.map(m => `<option value="${m.id}" ${m.id === selectedModel ? 'selected' : ''}>${m.name}</option>`).join('');
        opts += `<option value="custom" ${!isKnown && selectedModel ? 'selected' : ''}>✏️ Custom Model ID...</option>`;
        modelSelect.innerHTML = opts;

        const customSec = $("gcbCustomModelSection");
        const customInp = $("gcbCustomModelInput");
        if (customSec) {
            if (!isKnown && selectedModel) {
                customSec.style.display = "block";
                if (customInp) customInp.value = selectedModel;
            } else {
                customSec.style.display = modelSelect.value === "custom" ? "block" : "none";
            }
        }
    }

    function updateKeyVisibility() {
        const prov = providerSelect.value;
        $("gcbKeySectionGemini").style.display = prov === "gemini" ? "block" : "none";
        $("gcbKeySectionGroq").style.display = prov === "groq" ? "block" : "none";
        $("gcbKeySectionOpenAI").style.display = prov === "openai" ? "block" : "none";

        const currentModel = config.models[prov] || PROVIDER_MODELS[prov]?.[0]?.id;
        renderModelOptions(prov, currentModel);
    }

    providerSelect.addEventListener("change", updateKeyVisibility);
    modelSelect.addEventListener("change", () => {
        const customSec = $("gcbCustomModelSection");
        if (customSec) customSec.style.display = modelSelect.value === "custom" ? "block" : "none";
    });

    function hideAllOverlayCards() {
        if (settingsForm) settingsForm.style.display = "none";
        if (sessionsForm) sessionsForm.style.display = "none";
        if (usageForm) usageForm.style.display = "none";
        if (lockForm) lockForm.style.display = "none";
        if (tokenWarnForm) tokenWarnForm.style.display = "none";
    }

    function openLockModal() {
        hideAllOverlayCards();
        if (lockText) lockText.value = "";
        if (lockDate) lockDate.value = todayKey();
        if (lockError) lockError.textContent = "";
        if (lockForm) lockForm.style.display = "flex";
        overlay.classList.add("open");
    }

    function verifyLockPasscode() {
        const textVal = (lockText?.value || "").trim().toUpperCase();
        const dateVal = lockDate?.value || "";
        const todayVal = todayKey();

        if (textVal === "TDM" && dateVal === todayVal) {
            hideAllOverlayCards();
            openSettings();
            showOK("🔓 Passcode Verified! Settings Unlocked.");
        } else {
            if (lockError) lockError.textContent = "❌ Access Denied! Must type 'TDM' and select Today's calendar date.";
        }
    }

    function openSettings() {
        hideAllOverlayCards();
        providerSelect.value = config.activeProvider || "gemini";
        geminiKeyInput.value = config.keys.gemini || "";
        groqKeyInput.value = config.keys.groq || "";
        openaiKeyInput.value = config.keys.openai || "";

        geminiStatus.textContent = config.keys.gemini ? "✓ Key Saved Persistently" : "No Key Set";
        groqStatus.textContent = config.keys.groq ? "✓ Key Saved Persistently" : "No Key Set";
        openaiStatus.textContent = config.keys.openai ? "✓ Key Saved Persistently" : "No Key Set";

        sysPromptInput.value = config.systemPrompt;
        updateKeyVisibility();

        settingsForm.style.display = "flex";
        overlay.classList.add("open");
    }

    function openSessionsModal() {
        hideAllOverlayCards();
        renderSessionsList(currentMemFilter);
        sessionsForm.style.display = "flex";
        overlay.classList.add("open");
    }

    function openUsageModal() {
        hideAllOverlayCards();
        updateUsageModalStats(currentUsageRange);
        usageForm.style.display = "flex";
        overlay.classList.add("open");
    }

    function closeOverlay() {
        overlay.classList.remove("open");
    }

    async function saveSettings() {
        const prov = providerSelect.value;
        config.activeProvider = prov;
        config.keys.gemini = geminiKeyInput.value.trim();
        config.keys.groq = groqKeyInput.value.trim();
        config.keys.openai = openaiKeyInput.value.trim();

        let selModel = modelSelect.value;
        if (selModel === "custom") {
            const customInp = $("gcbCustomModelInput");
            selModel = (customInp?.value || "").trim();
        }
        config.models[prov] = selModel || PROVIDER_MODELS[prov]?.[0]?.id || "gemini-3.8-flash";
        config.systemPrompt = sysPromptInput.value.trim() || DEFAULT_CONFIG.systemPrompt;

        await saveConfig();
        updateModelBadge();
        closeOverlay();
        showOK("✅ Settings saved persistently");
    }

    function updateModelBadge() {
        const prov = config.activeProvider || "gemini";
        const m = config.models[prov] || "gemini-3.8-flash";
        modelBadge.textContent = `${prov.toUpperCase()}: ${m}`;
    }

    function checkDailyReset() {
        if (usage.day !== todayKey()) {
            usage.day = todayKey();
            usage.requestsToday = 0;
            usage.tokensToday = 0;
            usage.minuteTimestamps = [];
            saveUsageData();
        }
    }

    function updateUsageModalStats(range = currentUsageRange) {
        currentUsageRange = range;
        let reqs = 0;
        let toks = 0;
        const tk = todayKey();
        const currentWk = getWeekKey(Date.now());
        const currentMo = getMonthKey(Date.now());

        if (range === "today") {
            reqs = usage.requestsToday || (usageHistory[tk]?.requests || 0);
            toks = usage.tokensToday || (usageHistory[tk]?.tokens || 0);
        } else if (range === "week") {
            for (const [dateStr, data] of Object.entries(usageHistory)) {
                if (getWeekKey(new Date(dateStr).getTime()) === currentWk) {
                    reqs += (data.requests || 0);
                    toks += (data.tokens || 0);
                }
            }
            if (reqs === 0) { reqs = usage.requestsToday || 0; toks = usage.tokensToday || 0; }
        } else if (range === "month") {
            for (const [dateStr, data] of Object.entries(usageHistory)) {
                if (getMonthKey(new Date(dateStr).getTime()) === currentMo) {
                    reqs += (data.requests || 0);
                    toks += (data.tokens || 0);
                }
            }
            if (reqs === 0) { reqs = usage.requestsToday || 0; toks = usage.tokensToday || 0; }
        } else { // "all"
            reqs = usage.allTimeRequests || 0;
            toks = usage.allTimeTokens || 0;
            if (reqs === 0) {
                for (const [, data] of Object.entries(usageHistory)) {
                    reqs += (data.requests || 0);
                    toks += (data.tokens || 0);
                }
            }
        }

        const titleMap = { today: "Today", week: "This Week", month: "This Month", all: "All-Time" };
        const heading = $("gcbUsageHeading");
        if (heading) heading.textContent = `📊 AI Usage Stats (${titleMap[range] || 'Unified'})`;

        $("gcbStatTodayReq").textContent = reqs;
        $("gcbStatTodayTok").textContent = toks;
        $("gcbStatTotalReq").textContent = usage.allTimeRequests || reqs;
        $("gcbStatTotalTok").textContent = usage.allTimeTokens || toks;
        $("gcbUsageProviderInfo").textContent = `Active Provider: ${(config.activeProvider || "gemini").toUpperCase()} (${config.models[config.activeProvider || "gemini"] || ""})`;

        shadow.querySelectorAll(".gcb-usage-range-btn").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.range === range);
        });
    }

    function updateUsageStats(reqCount = 1, tokCount = 150) {
        checkDailyReset();
        const tk = todayKey();
        usage.requestsToday = (usage.requestsToday || 0) + reqCount;
        usage.tokensToday = (usage.tokensToday || 0) + tokCount;
        usage.allTimeRequests = (usage.allTimeRequests || 0) + reqCount;
        usage.allTimeTokens = (usage.allTimeTokens || 0) + tokCount;
        saveUsageData();

        if (!usageHistory[tk]) {
            usageHistory[tk] = { requests: 0, tokens: 0 };
        }
        usageHistory[tk].requests = (usageHistory[tk].requests || 0) + reqCount;
        usageHistory[tk].tokens = (usageHistory[tk].tokens || 0) + tokCount;
        storageSet(STORAGE_KEYS.USAGE_LOGS, usageHistory);
    }

    /* ---------------------------------------------------------
       MULTI-SESSION CHAT HISTORY ENGINE
       --------------------------------------------------------- */
    function createNewSession(firstMsgText = "") {
        const id = "sess_" + Date.now();
        const title = firstMsgText ? (firstMsgText.slice(0, 30) + (firstMsgText.length > 30 ? "..." : "")) : "New Conversation";
        const newSess = {
            id,
            title,
            createdAt: Date.now(),
            provider: config.activeProvider || "gemini",
            model: config.models[config.activeProvider || "gemini"] || "gemini-3.8-flash",
            messages: []
        };
        sessions.unshift(newSess);
        activeSessionId = id;
        saveSessions();
        storageSet(STORAGE_KEYS.ACTIVE, activeSessionId);
        return newSess;
    }

    function getActiveSession() {
        let sess = sessions.find(s => s.id === activeSessionId);
        if (!sess && sessions.length > 0) {
            sess = sessions[0];
            activeSessionId = sess.id;
        }
        if (!sess) {
            sess = createNewSession();
        }
        return sess;
    }

    function switchSession(sessId) {
        activeSessionId = sessId;
        storageSet(STORAGE_KEYS.ACTIVE, activeSessionId);
        renderCurrentSessionMessages();
        closeOverlay();
        updateModelBadge();
    }

    function renderSessionItemHTML(s) {
        const isActive = s.id === activeSessionId;
        const timeStr = new Date(s.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const msgCount = (s.messages || []).filter(m => m.role !== 'system').length;
        return `
            <div class="gcb-session-item ${isActive ? 'active' : ''}" data-id="${s.id}">
                <div class="gcb-session-info">
                    <span class="gcb-session-title">${escapeHtml(s.title || 'Untitled Session')}</span>
                    <span class="gcb-session-meta">
                        <span>${timeStr}</span> · 
                        <span style="text-transform:uppercase;color:#818cf8;">${s.provider || 'gemini'}</span> · 
                        <span>${msgCount} msgs</span>
                        ${isActive ? '<strong style="color:#10b981;">✓ Active</strong>' : ''}
                    </span>
                </div>
                <button class="gcb-session-del" data-del="${s.id}" title="Delete session">🗑️</button>
            </div>
        `;
    }

    function renderSessionsList(mode = currentMemFilter) {
        currentMemFilter = mode;
        shadow.querySelectorAll(".gcb-mem-filter-btn").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.mode === mode);
        });

        if (!sessions || sessions.length === 0) {
            sessionsList.innerHTML = `<div class="gcb-info" style="padding:16px;">No saved chat sessions. Click '➕ New Chat' to start one!</div>`;
            return;
        }

        if (mode === "all") {
            sessionsList.innerHTML = sessions.map(s => renderSessionItemHTML(s)).join('');
        } else {
            const groups = {};
            sessions.forEach(s => {
                const ts = s.createdAt || Date.now();
                let key = "";
                let label = "";
                if (mode === "date") {
                    key = todayKey(ts);
                    label = "📅 " + formatDateLabel(key);
                } else if (mode === "week") {
                    key = getWeekKey(ts);
                    label = "🗓️ " + key;
                } else if (mode === "month") {
                    key = getMonthKey(ts);
                    label = "📊 " + formatMonthLabel(key);
                }
                if (!groups[key]) groups[key] = { label, items: [] };
                groups[key].items.push(s);
            });

            let html = "";
            for (const key of Object.keys(groups)) {
                const grp = groups[key];
                html += `<div class="gcb-group-header">${grp.label} (${grp.items.length} sessions)</div>`;
                html += grp.items.map(s => renderSessionItemHTML(s)).join('');
            }
            sessionsList.innerHTML = html;
        }

        sessionsList.querySelectorAll(".gcb-session-item").forEach(item => {
            item.addEventListener("click", (e) => {
                if (e.target.classList.contains("gcb-session-del")) return;
                switchSession(item.dataset.id);
            });
        });

        sessionsList.querySelectorAll(".gcb-session-del").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                deleteSession(btn.dataset.del);
            });
        });
    }

    function deleteSession(sessId) {
        sessions = sessions.filter(s => s.id !== sessId);
        saveSessions();
        if (activeSessionId === sessId) {
            activeSessionId = sessions.length > 0 ? sessions[0].id : null;
            if (!activeSessionId) createNewSession();
            renderCurrentSessionMessages();
        }
        renderSessionsList(currentMemFilter);
    }

    function clearAllSessions() {
        sessions = [];
        saveSessions();
        createNewSession();
        renderCurrentSessionMessages();
        renderSessionsList(currentMemFilter);
        showOK("Cleared all chat sessions");
    }

    function renderCurrentSessionMessages() {
        messagesEl.innerHTML = "";
        const sess = getActiveSession();
        if (sess && sess.messages && sess.messages.length > 0) {
            for (const m of sess.messages) {
                if (m.role !== "system") {
                    addMsgToDOM(m.role, m.content);
                }
            }
        } else {
            addMsgToDOM("assistant", "Hello! Multi-AI Assistant is ready. Select a quick action below or ask any question!");
            renderQuickChips();
        }
        updateBadgeCounter();
    }

    function updateBadgeCounter() {
        const badge = shadow.getElementById("gcbBadge");
        if (badge) {
            badge.textContent = sessions.length;
            badge.classList.toggle("show", sessions.length > 0);
        }
    }

    function addMsgToDOM(role, content) {
        const m = document.createElement("div");
        m.className = "gcb-msg " + role;
        const av = document.createElement("div");
        av.className = "gcb-avatar";
        av.textContent = role === "user" ? "👤" : "🤖";
        const b = document.createElement("div");
        b.className = "gcb-bubble";
        b.innerHTML = renderMarkdown(content);
        m.appendChild(av); m.appendChild(b);
        messagesEl.appendChild(m);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function addMsg(role, content) {
        const sess = getActiveSession();
        if (sess.messages.length === 0 && role === "user") {
            sess.title = content.slice(0, 30) + (content.length > 30 ? "..." : "");
            sess.provider = config.activeProvider || "gemini";
            sess.model = config.models[config.activeProvider || "gemini"] || "gemini-3.8-flash";
        }
        sess.messages.push({ role, content });
        saveSessions();
        addMsgToDOM(role, content);
        updateBadgeCounter();
    }

    function showTyping() {
        const t = document.createElement("div");
        t.className = "gcb-msg bot"; t.id = "gcbTyping";
        t.innerHTML = `
            <div class="gcb-avatar">🤖</div>
            <div class="gcb-bubble gcb-typing-bubble">
                <span>AI is thinking</span>
                <span class="gcb-dots"><span>.</span><span>.</span><span>.</span></span>
            </div>`;
        messagesEl.appendChild(t);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function removeTyping() {
        const t = shadow.getElementById("gcbTyping");
        if (t) t.remove();
    }

    function renderQuickChips() {
        const old = shadow.getElementById("gcbQuickChips");
        if (old) old.remove();
        const chips = document.createElement("div");
        chips.className = "gcb-quick-chips";
        chips.id = "gcbQuickChips";
        chips.innerHTML = `
            <div class="gcb-chip-title">💡 Quick Actions</div>
            <div class="gcb-chips-row">
                <button class="gcb-chip" data-prompt="Perform a security scan for OWASP vulnerabilities on captured endpoints">🛡️ OWASP Audit</button>
                <button class="gcb-chip" data-prompt="Explain captured network traffic and identify slow endpoints">⚡ Analyze Traffic</button>
                <button class="gcb-chip" data-prompt="Help me debug console errors and rejected API promises">🐛 Debug Errors</button>
                <button class="gcb-chip" data-prompt="Generate a realistic mock JSON response for my API">🧪 Mock Response</button>
            </div>
        `;
        messagesEl.appendChild(chips);
        chips.querySelectorAll(".gcb-chip").forEach((btn) => {
            btn.addEventListener("click", () => {
                userInput.value = btn.dataset.prompt;
                sendMessage();
            });
        });
    }

    function showErr(msg) {
        const e = document.createElement("div");
        e.className = "gcb-msg bot";
        e.innerHTML = `<div class="gcb-bubble" style="background:rgba(220,38,38,0.2);color:#f87171;border-color:rgba(248,113,113,0.4);">${msg}</div>`;
        messagesEl.appendChild(e);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function showOK(msg) {
        const e = document.createElement("div");
        e.className = "gcb-msg bot";
        e.innerHTML = `<div class="gcb-bubble" style="background:rgba(22,163,74,0.2);color:#4ade80;border-color:rgba(74,222,128,0.4);">${msg}</div>`;
        messagesEl.appendChild(e);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    async function directAiCompletion(provider, apiKey, model, messages) {
        if (!apiKey || !apiKey.trim()) throw new Error(`Please set API key for ${provider.toUpperCase()} in Settings (⚙️).`);

        if (provider === "gemini") {
            const contents = [];
            let systemInstruction = null;
            for (const msg of messages || []) {
                if (!msg) continue;
                if (msg.role === "system") {
                    const sysText = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
                    if (sysText.trim()) systemInstruction = { parts: [{ text: sysText }] };
                } else {
                    const role = msg.role === "assistant" ? "model" : "user";
                    let parts = [];
                    if (typeof msg.content === "string") {
                        if (msg.content.trim()) parts = [{ text: msg.content }];
                    } else if (Array.isArray(msg.content)) {
                        parts = msg.content.map(c => typeof c === 'string' ? { text: c } : { text: c.text || JSON.stringify(c) }).filter(p => p.text);
                    }
                    if (!parts.length) continue;

                    if (contents.length > 0 && contents[contents.length - 1].role === role) {
                        contents[contents.length - 1].parts.push(...parts);
                    } else {
                        contents.push({ role, parts });
                    }
                }
            }

            if (contents.length === 0) {
                let fallbackText = "Hello";
                if (systemInstruction?.parts?.[0]?.text) {
                    fallbackText = systemInstruction.parts[0].text;
                }
                contents.push({ role: "user", parts: [{ text: fallbackText }] });
            }

            let gModel = model || "gemini-3.8-flash";

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${gModel}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
            const payload = { contents };
            if (systemInstruction) payload.systemInstruction = systemInstruction;

            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const ed = await res.json().catch(() => ({}));
                throw new Error((ed && ed.error && ed.error.message) || `Gemini API HTTP ${res.status}`);
            }

            const data = await res.json();
            const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!reply) throw new Error("Empty response from Gemini API");
            return { reply };
        }

        const activeModel = model || (provider === "groq" ? "qwen/qwen3.8-27b" : provider === "openai" ? "gpt-4o-mini" : "gemini-3.8-flash");

        const endpoint = provider === "groq"
            ? "https://api.groq.com/openai/v1/chat/completions"
            : "https://api.openai.com/v1/chat/completions";

        const validMessages = (messages || []).filter(m => m && typeof m.content === 'string' ? m.content.trim().length > 0 : Boolean(m?.content));

        const res = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey.trim()}`
            },
            body: JSON.stringify({
                model: activeModel,
                messages: validMessages.length > 0 ? validMessages : messages,
                temperature: 0.6,
                max_tokens: 4096
            })
        });

        if (!res.ok) {
            const ed = await res.json().catch(() => ({}));
            throw new Error((ed && ed.error && ed.error.message) || `${provider.toUpperCase()} HTTP ${res.status}`);
        }

        const data = await res.json();
        const choice = data.choices?.[0] || {};
        const msgObj = choice.message || {};
        let reply = msgObj.content || msgObj.reasoning_content || choice.text || choice.delta?.content || "";
        if (typeof reply === "object") reply = JSON.stringify(reply);

        if (!reply || !String(reply).trim()) throw new Error(`Empty response payload from ${provider.toUpperCase()} API.`);
        return { reply: String(reply).trim() };
    }

    let pendingWarnMsg = null;

    async function sendMessage(bypassTokenWarn = false) {
        if (isWaiting) return;
        const msg = (pendingWarnMsg || userInput.value || "").trim();
        if (!msg) return;

        const prov = config.activeProvider || "gemini";
        const apiKey = config.keys[prov] || "";
        const model = config.models[prov] || PROVIDER_MODELS[prov]?.[0]?.id || (prov === "groq" ? "qwen/qwen3.8-27b" : "gemini-2.5-flash");

        if (!apiKey) {
            showErr(`🔑 Please set API key for ${prov.toUpperCase()} in Settings (⚙️).`);
            openLockModal();
            return;
        }

        const sess = getActiveSession();

        /* Past Memory Toggle check: include turns or prompt-only */
        const includeMemory = config.includeMemory !== false;

        /* Token Warning Check (> 5000 tokens) */
        const pastContext = includeMemory ? sess.messages.map(m => m.content).join(" ") : "";
        const fullPromptText = (config.systemPrompt || "") + " " + pastContext + " " + msg;
        const estimatedTokens = Math.ceil(fullPromptText.length / 4);

        if (estimatedTokens > 5000 && !bypassTokenWarn) {
            pendingWarnMsg = msg;
            hideAllOverlayCards();
            if (tokenWarnText) {
                tokenWarnText.innerHTML = `Your prompt + context contains approximately <strong>~${estimatedTokens.toLocaleString()} input tokens</strong> (> 5,000 token safety threshold).<br><br>Sending this will consume high AI quota. Would you like to proceed or cancel?`;
            }
            if (tokenWarnForm) tokenWarnForm.style.display = "flex";
            overlay.classList.add("open");
            return;
        }

        pendingWarnMsg = null;
        userInput.value = "";
        isWaiting = true;
        addMsg("user", msg);
        showTyping();

        const historyTurns = includeMemory ? sess.messages : [{ role: "user", content: msg }];
        const messages = [
            { role: "system", content: config.systemPrompt || DEFAULT_CONFIG.systemPrompt },
            ...historyTurns
        ];

        try {
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({
                    action: 'aiCompletion',
                    provider: prov,
                    apiKey,
                    model,
                    messages
                }, async (res) => {
                    const lastErr = chrome.runtime.lastError;
                    if (lastErr || !res?.ok) {
                        try {
                            const fallbackRes = await directAiCompletion(prov, apiKey, model, messages);
                            isWaiting = false;
                            removeTyping();
                            addMsg("assistant", fallbackRes.reply);
                            updateUsageStats(1, 150);
                        } catch (directErr) {
                            isWaiting = false;
                            removeTyping();
                            const msgText = directErr?.message || res?.error || (lastErr && lastErr.message !== "The message port closed before a response was received." ? lastErr.message : null) || "API key invalid or request failed. Please check AI Settings (⚙️).";
                            showErr("Error: " + msgText);
                        }
                        return;
                    }
                    isWaiting = false;
                    removeTyping();
                    addMsg("assistant", res.result?.reply || "No response");
                    updateUsageStats(1, res.result?.usage?.total_tokens || 150);
                });
            } else {
                const fallbackRes = await directAiCompletion(prov, apiKey, model, messages);
                isWaiting = false;
                removeTyping();
                addMsg("assistant", fallbackRes.reply);
                updateUsageStats(1, 150);
            }
        } catch (err) {
            try {
                const fallbackRes = await directAiCompletion(prov, apiKey, model, messages);
                isWaiting = false;
                removeTyping();
                addMsg("assistant", fallbackRes.reply);
                updateUsageStats(1, 150);
            } catch (directErr) {
                isWaiting = false;
                removeTyping();
                showErr("Error: " + (directErr?.message || err?.message || "Failed to contact AI API"));
            }
        }
    }

    if (toggleBtn) toggleBtn.addEventListener("click", () => panel.classList.toggle("open"));
    if (closeBtn) closeBtn.addEventListener("click", () => panel.classList.remove("open"));
    if (minimizeBtn) {
        minimizeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            panel.classList.toggle("minimized");
        });
    }

    const gcbHeader = shadow.querySelector(".gcb-header");
    if (gcbHeader) {
        gcbHeader.addEventListener("click", (e) => {
            if (panel.classList.contains("minimized") && !e.target.closest(".gcb-icon-btn")) {
                panel.classList.remove("minimized");
            }
        });

        let isDragging = false;
        let startX = 0, startY = 0;
        let initialLeft = 0, initialTop = 0;

        gcbHeader.addEventListener("mousedown", (e) => {
            if (e.target.closest(".gcb-icon-btn") || e.target.closest("button") || e.target.closest("input") || e.target.closest("select")) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;
            panel.style.bottom = "auto";
            panel.style.right = "auto";
            panel.style.left = initialLeft + "px";
            panel.style.top = initialTop + "px";
            panel.style.transition = "none";
        });

        const onMove = (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            panel.style.left = (initialLeft + dx) + "px";
            panel.style.top = (initialTop + dy) + "px";
        };

        const onUp = () => {
            if (isDragging) {
                isDragging = false;
                panel.style.transition = "";
            }
        };

        shadow.addEventListener("mousemove", onMove);
        document.addEventListener("mousemove", onMove);
        shadow.addEventListener("mouseup", onUp);
        document.addEventListener("mouseup", onUp);
    }

    if (popoutBtn) {
        popoutBtn.addEventListener("click", () => {
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
                const url = chrome.runtime.getURL('popup.html?openChat=1');
                window.open(url, '_blank');
            }
        });
    }
    function updateMemoryToggleUI() {
        const active = config.includeMemory !== false;
        if (memoryToggleBtn) {
            memoryToggleBtn.textContent = active ? "🧠 Memory: ON" : "🧠 Memory: OFF";
            memoryToggleBtn.style.color = active ? "#a5b4fc" : "#94a3b8";
        }
    }

    if (memoryToggleBtn) {
        memoryToggleBtn.addEventListener("click", () => {
            config.includeMemory = config.includeMemory === false ? true : false;
            saveConfig();
            updateMemoryToggleUI();
        });
    }

    if (tokenWarnCancel) {
        tokenWarnCancel.addEventListener("click", () => {
            if (pendingWarnMsg && userInput) userInput.value = pendingWarnMsg;
            pendingWarnMsg = null;
            closeOverlay();
        });
    }

    if (tokenWarnSend) {
        tokenWarnSend.addEventListener("click", () => {
            closeOverlay();
            sendMessage(true);
        });
    }

    if (sendBtn) sendBtn.addEventListener("click", () => sendMessage());
    if (userInput) userInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });
    if (settingsBtn) settingsBtn.addEventListener("click", openLockModal);
    if (lockSubmit) lockSubmit.addEventListener("click", verifyLockPasscode);
    if (lockCancel) lockCancel.addEventListener("click", closeOverlay);
    if (sessionsBtn) sessionsBtn.addEventListener("click", openSessionsModal);
    if (newSessionBtn) newSessionBtn.addEventListener("click", () => { createNewSession(); renderCurrentSessionMessages(); closeOverlay(); });
    if (showUsageBtn) showUsageBtn.addEventListener("click", openUsageModal);
    if (clearAllSessionsBtn) clearAllSessionsBtn.addEventListener("click", clearAllSessions);
    if (sessionsCancel) sessionsCancel.addEventListener("click", closeOverlay);
    if (usageCancel) usageCancel.addEventListener("click", closeOverlay);
    if (settingsSave) settingsSave.addEventListener("click", saveSettings);
    if (settingsCancel) settingsCancel.addEventListener("click", closeOverlay);

    shadow.querySelectorAll(".gcb-mem-filter-btn").forEach(btn => {
        btn.addEventListener("click", () => renderSessionsList(btn.dataset.mode));
    });

    shadow.querySelectorAll(".gcb-usage-range-btn").forEach(btn => {
        btn.addEventListener("click", () => updateUsageModalStats(btn.dataset.range));
    });

    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            const sess = getActiveSession();
            sess.messages = [];
            saveSessions();
            renderCurrentSessionMessages();
        });
    }

    if (messagesEl) {
        messagesEl.addEventListener("click", (e) => {
            const btn = e.target.closest(".gcb-code-copy");
            if (btn) {
                const codeText = btn.parentElement?.nextElementSibling?.innerText || "";
                if (codeText) {
                    navigator.clipboard.writeText(codeText).then(() => {
                        btn.textContent = "✓ Copied!";
                        setTimeout(() => btn.textContent = "📋 Copy", 1500);
                    }).catch(() => {});
                }
            }
        });
    }

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === "openAiContext" && msg.prompt) {
            panel.classList.add("open");
            userInput.value = msg.prompt;
            sendMessage();
        }
    });

    loadAllState().then(() => {
        updateModelBadge();
        updateMemoryToggleUI();
        renderCurrentSessionMessages();

        if (toggleBtn) toggleBtn.style.display = "none";
        if (popoutBtn) popoutBtn.style.display = "none";
        if (panel) panel.classList.add("open");

        try {
            const urlParams = new URLSearchParams(window.location.search);
            const promptParam = urlParams.get('prompt');
            if (promptParam && userInput) {
                userInput.value = promptParam;
                sendMessage();
            }
        } catch (_) {}
    });
})();