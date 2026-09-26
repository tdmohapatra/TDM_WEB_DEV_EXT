const LIMIT = 200;
const KEY = (tabId) => `tab_${tabId}`;

const getList = async (tabId) => {
  const d = await chrome.storage.session.get(KEY(tabId));
  return d[KEY(tabId)] || [];
};
const setList = async (tabId, list) => {
  await chrome.storage.session.set({ [KEY(tabId)]: list });
};

const getMocks = () => new Promise(resolve =>
  chrome.storage.local.get('mocks', d => resolve(d.mocks || []))
);
const setMocks = (mocks) => new Promise(resolve =>
  chrome.storage.local.set({ mocks }, resolve)
);

async function pushMocksToTab(tabId, mocks) {
  if (!tabId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (rules) => { window.__API_MOCK_RULES__ = rules; },
      args: [mocks],
    });
  } catch (_) {}
}

/* ── Capture control state ── */
let capturePaused = false;
const blockedUrls = new Set();

/* ── AI context menu ── */
function createAiContextMenus() {
  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) { /* ignore */ }
    const menus = [
      { id: 'ai-know-selection', title: 'Ask AI about selected text', contexts: ['selection'] },
      { id: 'ai-know-image', title: 'Ask AI about this image', contexts: ['image'] },
      { id: 'ai-know-page', title: 'Ask AI about this page', contexts: ['page'] }
    ];
    for (const item of menus) {
      chrome.contextMenus.create(item, () => {
        if (chrome.runtime.lastError) { /* ignore duplicate errors silently */ }
      });
    }
  });
}

async function getPageText(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: 'getPageContext' });
    return response?.text || '';
  } catch (_) {
    // Restricted pages do not expose content scripts; AI can still use the URL and captured data.
    return '';
  }
}

chrome.runtime.onInstalled.addListener(createAiContextMenus);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  let prompt = '';
  if (info.menuItemId === 'ai-know-selection') {
    prompt = 'Explain and help me understand this selected text:\n\n' + (info.selectionText || '');
  } else if (info.menuItemId === 'ai-know-image') {
    prompt = 'Describe and explain this image.';
  } else if (info.menuItemId === 'ai-know-page') {
    const pageText = await getPageText(tab.id);
    prompt = 'Summarize and explain this page. Page title: ' + (tab.title || '') +
      '\nPage URL: ' + (info.pageUrl || tab.url || '') +
      (pageText ? '\n\nPage text:\n' + pageText.slice(0, 12000) : '');
  } else {
    return;
  }

  try {
    const url = chrome.runtime.getURL(`popup.html?tabId=${tab.id}&prompt=${encodeURIComponent(prompt)}`);
    openStandaloneWindow(url);
  } catch (_) {}
});

function normUrl(url) {
  try { const u = new URL(url); return u.origin + u.pathname; } catch (_) { return url; }
}

let _standaloneWinId = null;
async function openStandaloneWindow(url) {
  if (_standaloneWinId != null) {
    try {
      const win = await chrome.windows.get(_standaloneWinId);
      if (win) {
        const [tab] = await chrome.tabs.query({ windowId: _standaloneWinId });
        if (tab?.id) {
          await chrome.tabs.update(tab.id, { url, active: true });
        }
        await chrome.windows.update(_standaloneWinId, { focused: true });
        return;
      }
    } catch (_) {
      _standaloneWinId = null;
    }
  }

  const createdWin = await chrome.windows.create({
    url,
    type: 'popup',
    width: 1400,
    height: 900,
    focused: true
  });
  _standaloneWinId = createdWin.id;
}

chrome.action.onClicked.addListener(async (tab) => {
  const url = chrome.runtime.getURL(`popup.html?tabId=${tab?.id || ''}`);
  openStandaloneWindow(url);
});

/* ── Message handlers ── */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.action === 'openAiContext' && msg.prompt) {
    (async () => {
      try {
        let tabId = msg.tabId || null;
        if (!tabId) {
          const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
          const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
          tabId = tab?.id ?? null;
        }

        let prompt = String(msg.prompt);
        if (msg.includePageContext && tabId) {
          const pageText = await getPageText(tabId);
          if (pageText) prompt += '\n\nCurrent page text:\n' + pageText.slice(0, 12000);
        }

        const url = chrome.runtime.getURL(`popup.html?tabId=${tabId || ''}&prompt=${encodeURIComponent(prompt.slice(0, 24000))}`);
        openStandaloneWindow(url);
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true;
  }

  if (msg.action === 'captureAPI') {
    if (!sender.tab?.id) { sendResponse({ ok: false, error: 'No sender tab' }); return true; }
    if (capturePaused) { sendResponse({ ok: true, skipped: 'paused' }); return true; }
    if (blockedUrls.has(normUrl(msg.request?.url || ''))) {
      sendResponse({ ok: true, skipped: 'blocked' });
      return true;
    }
    const tabId = sender.tab.id;
    (async () => {
      const list = await getList(tabId);
      const req = msg.request;
      const i = list.findIndex((r) => r.id === req.id);
      if (i >= 0) list[i] = req; else list.unshift(req);
      if (list.length > LIMIT) list.length = LIMIT;
      await setList(tabId, list);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.action === 'getAPIs') {
    (async () => {
      let tabId = msg.tabId || null;
      let tabUrl = null;
      if (!tabId) {
        try {
          const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
          const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
          tabId = tab?.id ?? null;
          tabUrl = tab?.url ?? null;
        } catch (_) {}
      } else {
        try {
          const tab = await chrome.tabs.get(tabId);
          tabUrl = tab?.url ?? null;
        } catch (_) {}
      }
      const list = tabId ? await getList(tabId) : [];
      const mocks = await getMocks();
      sendResponse({
        requests: list, tabId, tabUrl,
        paused: capturePaused,
        blockedUrls: [...blockedUrls],
        mocks,
      });
    })();
    return true;
  }

  if (msg.action === 'clearAPIs') {
    (async () => {
      let tabId = msg.tabId || null;
      if (!tabId) {
        try {
          const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
          const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
          tabId = tab?.id ?? null;
        } catch (_) {}
      }
      if (tabId) await setList(tabId, []);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.action === 'pauseCapture')  { capturePaused = true;  sendResponse({ ok: true }); return; }
  if (msg.action === 'resumeCapture') { capturePaused = false; sendResponse({ ok: true }); return; }

  if (msg.action === 'blockUrl') {
    blockedUrls.add(normUrl(msg.url));
    sendResponse({ ok: true, blockedUrls: [...blockedUrls] });
    return;
  }
  if (msg.action === 'unblockUrl') {
    blockedUrls.delete(normUrl(msg.url));
    sendResponse({ ok: true, blockedUrls: [...blockedUrls] });
    return;
  }

  /* ── AI Completion Unified Dispatcher ── */
  if (msg.action === 'aiCompletion') {
    (async () => {
      try {
        let apiKey = msg.apiKey;
        let provider = msg.provider || 'gemini';
        let model = msg.model;

        /* Auto-fallback to saved credentials in storage if apiKey not provided in msg */
        if (!apiKey || !apiKey.trim()) {
          const cfg = await new Promise((r) => chrome.storage.local.get('app_ai_config_v3', (d) => r(d.app_ai_config_v3 || null)));
          if (cfg) {
            provider = provider || cfg.activeProvider || 'gemini';
            apiKey = cfg.keys?.[provider] || '';
            model = model || cfg.models?.[provider];
          }
        }

        const result = await callAiCompletion({
          provider,
          apiKey,
          model,
          messages: msg.messages,
          temperature: msg.temperature,
        });
        sendResponse({ ok: true, result });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true;
  }

  /* ── Tab Context Code Execution ── */
  if (msg.action === 'executeInTab' && msg.tabId) {
    (async () => {
      try {
        const res = await chrome.scripting.executeScript({
          target: { tabId: msg.tabId },
          world: 'MAIN',
          func: new Function('fetchArgs', `return (async () => {
            const [url, opts] = fetchArgs;
            const t0 = performance.now();
            try {
              const r = await fetch(url, opts);
              const elapsed = Math.round(performance.now() - t0);
              const text = await r.text();
              const rh = {};
              r.headers.forEach((v, k) => rh[k] = v);
              return { ok: true, status: r.status, statusText: r.statusText, elapsed, text, headers: rh };
            } catch (e) {
              return { ok: false, error: String(e) };
            }
          })()`),
          args: [msg.fetchArgs],
        });
        sendResponse({ ok: true, result: res[0]?.result });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true;
  }

  /* ── Header Rules CRUD ── */
  const getHeaderRules = () => new Promise(resolve => chrome.storage.local.get('headerRules', d => resolve(d.headerRules || [])));
  const setHeaderRules = (headerRules) => new Promise(resolve => chrome.storage.local.set({ headerRules }, resolve));

  if (msg.action === 'getHeaderRules') {
    getHeaderRules().then(headerRules => sendResponse({ headerRules }));
    return true;
  }

  if (msg.action === 'addHeaderRule') {
    (async () => {
      const rules = await getHeaderRules();
      const rule = { ...msg.rule, id: Date.now(), enabled: true };
      rules.push(rule);
      await setHeaderRules(rules);
      sendResponse({ ok: true, headerRules: rules });
    })();
    return true;
  }

  if (msg.action === 'removeHeaderRule') {
    (async () => {
      const rules = (await getHeaderRules()).filter(r => r.id !== msg.id);
      await setHeaderRules(rules);
      sendResponse({ ok: true, headerRules: rules });
    })();
    return true;
  }

  if (msg.action === 'toggleHeaderRule') {
    (async () => {
      const rules = (await getHeaderRules()).map(r => r.id === msg.id ? { ...r, enabled: !r.enabled } : r);
      await setHeaderRules(rules);
      sendResponse({ ok: true, headerRules: rules });
    })();
    return true;
  }

  /* ── Mock CRUD ── */
  if (msg.action === 'getMocks') {
    getMocks().then(mocks => sendResponse({ mocks }));
    return true;
  }

  if (msg.action === 'addMock') {
    (async () => {
      const mocks = await getMocks();
      const mock = { ...msg.mock, id: Date.now(), enabled: true };
      mocks.push(mock);
      await setMocks(mocks);
      if (msg.tabId) await pushMocksToTab(msg.tabId, mocks);
      sendResponse({ ok: true, mocks });
    })();
    return true;
  }

  if (msg.action === 'removeMock') {
    (async () => {
      const mocks = (await getMocks()).filter(m => m.id !== msg.id);
      await setMocks(mocks);
      if (msg.tabId) await pushMocksToTab(msg.tabId, mocks);
      sendResponse({ ok: true, mocks });
    })();
    return true;
  }

  if (msg.action === 'toggleMock') {
    (async () => {
      const mocks = (await getMocks()).map(m => m.id === msg.id ? { ...m, enabled: !m.enabled } : m);
      await setMocks(mocks);
      if (msg.tabId) await pushMocksToTab(msg.tabId, mocks);
      sendResponse({ ok: true, mocks });
    })();
    return true;
  }
});

/* ── Multi-Provider AI Helper Function ── */
async function callAiCompletion({ provider = 'gemini', apiKey, model, messages, temperature = 0.7 }) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error(`API key for ${provider.toUpperCase()} is missing. Please set it in AI Settings.`);
  }

  if (provider === 'gemini') {
    const contents = [];
    let systemInstruction = null;

    for (const msg of messages || []) {
      if (!msg) continue;
      if (msg.role === 'system') {
        const sysText = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        if (sysText.trim()) {
          systemInstruction = { parts: [{ text: sysText }] };
        }
      } else {
        const role = msg.role === 'assistant' ? 'model' : 'user';
        let parts = [];
        if (typeof msg.content === 'string') {
          if (msg.content.trim()) parts = [{ text: msg.content }];
        } else if (Array.isArray(msg.content)) {
          parts = msg.content.map((c) => {
            if (c.type === 'text') return { text: c.text };
            if (c.type === 'image_url') {
              const url = c.image_url?.url || '';
              const match = url.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
              if (match) {
                return { inline_data: { mime_type: match[1], data: match[2] } };
              }
              return { text: `[Image: ${url}]` };
            }
            return { text: String(c) };
          }).filter((p) => p.text || p.inline_data);
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
      let fallbackText = 'Hello';
      if (systemInstruction?.parts?.[0]?.text) {
        fallbackText = systemInstruction.parts[0].text;
      }
      contents.push({ role: 'user', parts: [{ text: fallbackText }] });
    }

    let geminiModel = model || 'gemini-3.8-flash';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
    const payload = { contents };
    if (systemInstruction) payload.systemInstruction = systemInstruction;
    payload.generationConfig = { temperature };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson?.error?.message || `Gemini API HTTP ${res.status}`);
    }

    const data = await res.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) throw new Error('Empty response from Gemini API');

    const promptTokens = data.usageMetadata?.promptTokenCount || 0;
    const candidatesTokens = data.usageMetadata?.candidatesTokenCount || 0;
    const totalTokens = data.usageMetadata?.totalTokenCount || (promptTokens + candidatesTokens);

    return {
      reply,
      usage: {
        total_tokens: totalTokens,
        prompt_tokens: promptTokens,
        completion_tokens: candidatesTokens,
      },
    };
  }

  /* Groq or OpenAI */
  const DEFAULT_MODELS = {
    gemini: 'gemini-3.8-flash',
    groq: 'qwen/qwen3.8-27b',
    openai: 'gpt-4o-mini',
  };
  const activeModel = model || DEFAULT_MODELS[provider] || 'qwen/qwen3.8-27b';

  const endpoint = provider === 'groq'
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions';

  const validMessages = (messages || []).filter(m => m && typeof m.content === 'string' ? m.content.trim().length > 0 : Boolean(m?.content));

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: activeModel,
      messages: validMessages.length > 0 ? validMessages : messages,
      temperature,
      max_tokens: 4096,
    }),
  });

  const data = await res.json();
  const choice = data.choices?.[0] || {};
  const msgObj = choice.message || {};
  let reply = msgObj.content || msgObj.reasoning_content || choice.text || choice.delta?.content || '';
  if (typeof reply === 'object') reply = JSON.stringify(reply);

  if (!reply || !String(reply).trim()) throw new Error(`Empty response payload from ${provider.toUpperCase()} API.`);

  return {
    reply: String(reply).trim(),
    usage: data.usage || { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 },
  };
}

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(KEY(tabId)).catch(() => {});
});

