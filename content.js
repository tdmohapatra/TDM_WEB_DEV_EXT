/* ISOLATED world — bridges page postMessage → extension background */
const pageOrigin = window.location.origin;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== 'getPageContext') return false;
  sendResponse({
    text: document.body?.innerText || document.documentElement?.innerText || '',
  });
  return true;
});

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== pageOrigin) return;
  const data = event.data;
  if (!data?.__apiInspector || !data.payload) return;
  try {
    chrome.runtime.sendMessage({ action: 'captureAPI', request: data.payload }, () => {
      if (chrome.runtime.lastError) {
        // Silently consume disconnected background port errors
      }
    });
  } catch (_) { /* context invalidated */ }
});

/* Push current mock & header rules to injected.js on page load */
try {
  chrome.runtime.sendMessage({ action: 'getMocks' }, (res) => {
    if (chrome.runtime.lastError) return;
    window.postMessage({ __apiMockRules: true, mocks: res?.mocks || [] }, pageOrigin);
  });
} catch (_) {}

try {
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get('headerRules', (res) => {
      if (chrome.runtime.lastError) return;
      window.postMessage({ __apiHeaderRules: true, headerRules: res?.headerRules || [] }, pageOrigin);
    });
  }
} catch (_) {}

/* Relay mock & header rule changes to injected.js */
try {
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (changes.mocks) {
          window.postMessage({ __apiMockRules: true, mocks: changes.mocks.newValue || [] }, pageOrigin);
        }
        if (changes.headerRules) {
          window.postMessage({ __apiHeaderRules: true, headerRules: changes.headerRules.newValue || [] }, pageOrigin);
        }
      }
    });
  }
} catch (_) {}


