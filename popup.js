
(function () {
  const $ = (id) => document.getElementById(id);

const els = {
  list: $('requestsList'), count: $('countBadge'),
  search: $('searchBox'), method: $('methodFilter'),
  status: $('statusFilter'), type: $('typeFilter'),
  export: $('exportBtn'), clear: $('clearBtn'),
  postman: $('postmanBtn'), pause: $('pauseBtn'),
  har: $('harBtn'), mocks: $('mocksBtn'), diff: $('diffBtn'),
  pausedChip: $('pausedChip'), mocksChip: $('mocksChip'),
  autoScroll: $('autoScrollBtn'),
  ai: $('aiBtn'),
  detailEmpty: $('detailEmpty'), detailView: $('detailView'),
  detailMethod: $('detailMethod'), detailUrl: $('detailUrl'),
  detailActions: $('detailActions'),
  tabs: $('tabs'), tabPanels: $('tabPanels'),
  editModal: $('editModal'), modalTitle: $('modalTitle'),
  modalClose: $('modalClose'), modalCancel: $('modalCancel'),
  modalSend: $('modalSend'), replayResult: $('replayResult'),
  editMethod: $('editMethod'), editUrl: $('editUrl'),
  editHeaders: $('editHeaders'), editBody: $('editBody'), editInTab: $('editInTab'),
  mocksModal: $('mocksModal'), mocksClose: $('mocksClose'),
  mocksCancel: $('mocksCancel'), mockSave: $('mockSave'),
  mocksList: $('mocksList'), mockPattern: $('mockPattern'),
  mockMethod: $('mockMethod'), mockMatchType: $('mockMatchType'),
  mockStatus: $('mockStatus'), mockStatusText: $('mockStatusText'),
  mockDelay: $('mockDelay'), mockHeaders: $('mockHeaders'), mockBody: $('mockBody'),
  diffModal: $('diffModal'), diffClose: $('diffClose'), diffCloseBtn: $('diffCloseBtn'),
  diffReqA: $('diffReqA'), diffReqB: $('diffReqB'),
  diffPaneA: $('diffPaneA'), diffPaneB: $('diffPaneB'),
  headerRulesBtn: $('headerRulesBtn'), headerRulesModal: $('headerRulesModal'),
  headerRulesClose: $('headerRulesClose'), headerRulesCancel: $('headerRulesCancel'),
  headerRuleSave: $('headerRuleSave'), headerRulesList: $('headerRulesList'),
  headerRuleAction: $('headerRuleAction'), headerRuleMethod: $('headerRuleMethod'),
  headerRuleMatchType: $('headerRuleMatchType'), headerRulePattern: $('headerRulePattern'),
  headerRuleName: $('headerRuleName'), headerRuleValue: $('headerRuleValue'),
  auditBtn: $('auditBtn'), auditModal: $('auditModal'),
  auditClose: $('auditClose'), auditCloseBtn: $('auditCloseBtn'),
  startAuditBtn: $('startAuditBtn'), auditContent: $('auditContent'),
  toast: $('toast'),
};

const _urlTabId = parseInt(new URLSearchParams(location.search).get('tabId') || '0', 10) || null;
const state = {
  all: [], selectedId: null, tab: 'request', tabId: _urlTabId,
  paused: false, blockedUrls: [], mocks: [],
  autoScroll: false, listHash: '', tabUrl: null,
};

/* ── Toast ── */
let _toastTimer = null;
function showToast(msg, duration = 1800) {
  els.toast.textContent = msg;
  els.toast.classList.remove('hidden');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => els.toast.classList.add('hidden'), duration);
}

/* ── Boot ── */
document.addEventListener('DOMContentLoaded', async () => {
  initResizer();

  let searchTimer = null;
  els.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderList, 150);
  });
  els.method.addEventListener('change', renderList);
  els.status.addEventListener('change', renderList);
  els.type.addEventListener('change', renderList);
  els.export.addEventListener('click', exportJson);
  els.postman.addEventListener('click', exportPostman);
  els.har.addEventListener('click', exportHar);
  els.clear.addEventListener('click', clearAll);
  els.pause.addEventListener('click', togglePause);
  els.autoScroll.addEventListener('click', toggleAutoScroll);
  els.mocks.addEventListener('click', () => openMocksModal());
  els.headerRulesBtn.addEventListener('click', () => openHeaderRulesModal());
  els.auditBtn.addEventListener('click', () => openAuditModal());
  els.diff.addEventListener('click', openDiffModal);
  els.ai.addEventListener('click', () => {
    const host = document.getElementById('groq-chat-widget-host');
    if (host && host.shadowRoot) {
      const p = host.shadowRoot.getElementById('gcbPanel');
      if (p) p.classList.add('open');
    } else {
      askAiAboutPage();
    }
  });

  els.diffClose.addEventListener('click', closeDiffModal);
  els.diffCloseBtn.addEventListener('click', closeDiffModal);
  els.diffReqA.addEventListener('change', renderDiff);
  els.diffReqB.addEventListener('change', renderDiff);

  /* Header Rules modal */
  els.headerRulesClose.addEventListener('click', closeHeaderRulesModal);
  els.headerRulesCancel.addEventListener('click', closeHeaderRulesModal);
  els.headerRuleSave.addEventListener('click', saveHeaderRule);

  /* Audit modal */
  els.auditClose.addEventListener('click', closeAuditModal);
  els.auditCloseBtn.addEventListener('click', closeAuditModal);
  els.startAuditBtn.addEventListener('click', runAiSecurityAudit);

  els.tabs.addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (!t || t.hidden) return;
    state.tab = t.dataset.tab;
    els.tabs.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
    renderDetail();
  });

  els.tabPanels.addEventListener('click', (e) => {
    const toggle = e.target.closest('.json-toggle');
    if (toggle) {
      const p = toggle.parentElement;
      if (p) {
        p.classList.toggle('json-collapsed');
        p.classList.toggle('json-expanded');
      }
      return;
    }
    const keyEl = e.target.closest('.json-key[data-path]');
    if (keyEl) {
      const path = keyEl.dataset.path;
      if (path) {
        navigator.clipboard.writeText(path).then(() => {
          showToast('Copied JSON path: ' + path);
        }).catch(() => {});
      }
    }
  });

  /* Edit modal */
  els.modalClose.addEventListener('click', closeEditModal);
  els.modalCancel.addEventListener('click', closeEditModal);
  els.editModal.addEventListener('click', (e) => { if (e.target === els.editModal) closeEditModal(); });
  els.modalSend.addEventListener('click', sendEditedRequest);

  /* Mocks modal */
  els.mocksClose.addEventListener('click', closeMocksModal);
  els.mocksCancel.addEventListener('click', closeMocksModal);
  els.mocksModal.addEventListener('click', (e) => { if (e.target === els.mocksModal) closeMocksModal(); });
  els.mockSave.addEventListener('click', saveMock);

  await refresh();
  chrome.storage.onChanged.addListener((_, area) => { if (area === 'session') refresh(); });
  setInterval(refresh, 1500);
});

/* ── Pause ── */
function togglePause() {
  const action = state.paused ? 'resumeCapture' : 'pauseCapture';
  chrome.runtime.sendMessage({ action }, () => {
    state.paused = !state.paused;
    updatePauseUI();
    showToast(state.paused ? 'Capture paused' : 'Capture resumed');
  });
}
function updatePauseUI() {
  if (state.paused) {
    els.pause.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5,3 19,12 5,21 5,3"/></svg> Resume`;
    els.pause.classList.add('active');
    els.pausedChip.classList.remove('hidden');
  } else {
    els.pause.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause`;
    els.pause.classList.remove('active');
    els.pausedChip.classList.add('hidden');
  }
}

/* ── Auto-scroll ── */
function toggleAutoScroll() {
  state.autoScroll = !state.autoScroll;
  els.autoScroll.classList.toggle('active', state.autoScroll);
  showToast(state.autoScroll ? 'Auto-scroll on' : 'Auto-scroll off');
}

/* ── Resizable split pane ── */
function initResizer() {
  const resizer = $('resizer');
  const listPane = $('listPane');
  const content = document.querySelector('.content');
  let dragging = false, startX = 0, startW = 0;

  try {
    const saved = parseFloat(localStorage.getItem('__api_split_pct') || '');
    if (saved >= 20 && saved <= 65) listPane.style.width = saved + '%';
  } catch (_) {}

  resizer.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.clientX;
    startW = listPane.getBoundingClientRect().width;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const contentW = content.getBoundingClientRect().width;
    const newW = startW + (e.clientX - startX);
    const pct = Math.min(Math.max((newW / contentW) * 100, 20), 65);
    listPane.style.width = pct + '%';
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    try {
      const pct = parseFloat(listPane.style.width);
      if (!isNaN(pct)) localStorage.setItem('__api_split_pct', String(pct));
    } catch (_) {}
  });
}

/* ── Data ── */
async function refresh() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getAPIs', tabId: state.tabId }, (res) => {
      if (chrome.runtime.lastError) return resolve();
      if (!state.tabId && res?.tabId) state.tabId = res.tabId;
      if (res?.tabUrl) state.tabUrl = res.tabUrl;
      state.all = res?.requests || [];
      state.paused = res?.paused || false;
      state.blockedUrls = res?.blockedUrls || [];
      state.mocks = res?.mocks || [];
      if (state.selectedId && !state.all.some((r) => r.id === state.selectedId)) {
        state.selectedId = null;
      }
      els.count.textContent = state.all.length;
      updatePauseUI();
      updateMocksChip();
      renderList();
      renderDetail();
      resolve();
    });
  });
}

function clearAll() {
  if (!confirm('Clear all captured requests?')) return;
  chrome.runtime.sendMessage({ action: 'clearAPIs', tabId: state.tabId }, () => {
    state.all = []; state.selectedId = null;
    els.count.textContent = '0';
    renderList(); renderDetail();
  });
}

/* ── Export JSON ── */
function exportJson() {
  if (!state.all.length) return showToast('Nothing to export.');
  const blob = new Blob([JSON.stringify({
    exportedAt: new Date().toISOString(),
    count: state.all.length,
    requests: state.all,
  }, null, 2)], { type: 'application/json' });
  dl(blob, `tdm-inspector-${Date.now()}.json`);
}

/* ── Export HAR ── */
function exportHar() {
  const apiReqs = state.all.filter((r) => r.type === 'fetch' || r.type === 'xhr');
  if (!apiReqs.length) return showToast('No fetch/XHR requests to export.');

  const entries = apiReqs.map((r) => {
    const urlObj = tryUrl(r.url);
    const reqHeaders = Object.entries(r.requestHeaders || {}).map(([k, v]) => ({ name: k, value: String(v) }));
    const resHeaders = Object.entries(r.responseHeaders || {}).map(([k, v]) => ({ name: k, value: String(v) }));
    const bodyText = r.requestBody != null
      ? (typeof r.requestBody === 'string' ? r.requestBody : JSON.stringify(r.requestBody))
      : '';
    const resBodyText = r.responseBody != null
      ? (typeof r.responseBody === 'string' ? r.responseBody : JSON.stringify(r.responseBody))
      : '';
    const mimeType = r.requestHeaders?.['content-type'] || 'application/octet-stream';
    const resMimeType = r.responseHeaders?.['content-type'] || 'application/octet-stream';
    const elapsed = r.responseTime != null ? Math.round(r.responseTime) : -1;

    return {
      startedDateTime: new Date(r.timestamp || Date.now()).toISOString(),
      time: elapsed,
      request: {
        method: r.method,
        url: r.url,
        httpVersion: 'HTTP/1.1',
        headers: reqHeaders,
        queryString: urlObj
          ? [...urlObj.searchParams.entries()].map(([k, v]) => ({ name: k, value: v }))
          : [],
        ...(bodyText ? { postData: { mimeType, text: bodyText } } : {}),
        headersSize: -1,
        bodySize: bodyText ? bodyText.length : -1,
      },
      response: {
        status: r.statusCode || 0,
        statusText: r.statusText || '',
        httpVersion: 'HTTP/1.1',
        headers: resHeaders,
        content: { size: resBodyText.length, mimeType: resMimeType, text: resBodyText },
        redirectURL: '',
        headersSize: -1,
        bodySize: resBodyText.length,
      },
      cache: {},
      timings: { send: 0, wait: elapsed, receive: 0 },
    };
  });

  const har = {
    log: {
      version: '1.2',
      creator: { name: 'TDM_WEB_DEV_EXT', version: '2.0' },
      entries,
    },
  };
  dl(new Blob([JSON.stringify(har, null, 2)], { type: 'application/json' }), `network-${Date.now()}.har`);
  showToast(`Exported ${entries.length} request${entries.length !== 1 ? 's' : ''} as HAR`);
}

/* ── Export Postman ── */
function exportPostman() {
  const apiReqs = state.all.filter((r) => r.type === 'fetch' || r.type === 'xhr');
  if (!apiReqs.length) return showToast('No fetch/XHR requests to export.');

  const items = apiReqs.map((r) => {
    const urlObj = tryUrl(r.url);
    const rawUrl = {
      raw: r.url,
      protocol: urlObj?.protocol?.replace(':', '') || 'https',
      host: urlObj ? urlObj.hostname.split('.') : [r.url],
      path: urlObj ? urlObj.pathname.replace(/^\//, '').split('/') : [],
      query: urlObj
        ? [...urlObj.searchParams.entries()].map(([k, v]) => ({ key: k, value: v }))
        : [],
    };
    const headers = Object.entries(r.requestHeaders || {})
      .filter(([k]) => !/^(content-length|host|connection)$/i.test(k))
      .map(([k, v]) => ({ key: k, value: String(v) }));
    const body = r.requestBody != null && !['GET', 'HEAD'].includes(r.method)
      ? {
          mode: 'raw',
          raw: typeof r.requestBody === 'string' ? r.requestBody : JSON.stringify(r.requestBody, null, 2),
          options: { raw: { language: 'json' } },
        }
      : { mode: 'none' };
    return {
      name: (urlObj ? (urlObj.pathname || '/') : r.url).slice(0, 80),
      request: { method: r.method, header: headers, url: rawUrl, body },
    };
  });

  const collection = {
    info: {
      name: `TDM_WEB_DEV_EXT — ${new Date().toLocaleDateString()}`,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: items,
  };
  dl(new Blob([JSON.stringify(collection, null, 2)], { type: 'application/json' }), `postman-collection-${Date.now()}.json`);
  showToast(`Exported ${items.length} request${items.length !== 1 ? 's' : ''} as Postman collection`);
}

function dl(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ── Mocks UI ── */
function updateMocksChip() {
  const active = state.mocks.filter(m => m.enabled).length;
  if (active > 0) {
    els.mocksChip.textContent = `${active} MOCK${active !== 1 ? 'S' : ''}`;
    els.mocksChip.classList.remove('hidden');
  } else {
    els.mocksChip.classList.add('hidden');
  }
}

function openMocksModal(prefillPattern) {
  renderMocksList();
  if (prefillPattern) els.mockPattern.value = prefillPattern;
  els.mocksModal.classList.remove('hidden');
}
function closeMocksModal() {
  els.mocksModal.classList.add('hidden');
}

function renderMocksList() {
  if (!state.mocks.length) {
    els.mocksList.innerHTML = `<div class="mocks-empty">No mock rules yet. Add one below.</div>`;
    return;
  }
  els.mocksList.innerHTML = state.mocks.map(m => `
    <div class="mock-item${m.enabled ? '' : ' disabled'}">
      <label class="mock-toggle-wrap" title="${m.enabled ? 'Disable' : 'Enable'}">
        <input type="checkbox" class="mock-toggle-input" data-id="${m.id}" ${m.enabled ? 'checked' : ''} />
        <span class="mock-toggle-track"></span>
      </label>
      <div class="mock-info">
        <div class="mock-pattern" title="${escAttr(m.pattern)}">${escHtml(m.pattern)}</div>
        <div class="mock-meta">${m.status} ${escHtml(m.statusText || '')} · ${escHtml((m.body || '(empty)').slice(0, 70))}${(m.body || '').length > 70 ? '…' : ''}</div>
      </div>
      <button class="mock-delete" data-id="${m.id}" title="Remove">×</button>
    </div>`).join('');

  els.mocksList.querySelectorAll('.mock-toggle-input').forEach(cb => {
    cb.addEventListener('change', () => {
      chrome.runtime.sendMessage({ action: 'toggleMock', id: Number(cb.dataset.id), tabId: state.tabId }, res => {
        state.mocks = res?.mocks || state.mocks;
        updateMocksChip(); renderMocksList();
      });
    });
  });
  els.mocksList.querySelectorAll('.mock-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'removeMock', id: Number(btn.dataset.id), tabId: state.tabId }, res => {
        state.mocks = res?.mocks || state.mocks;
        updateMocksChip(); renderMocksList();
        showToast('Mock removed');
      });
    });
  });
}

function saveMock() {
  const pattern = els.mockPattern.value.trim();
  if (!pattern) { showToast('URL pattern is required'); return; }
  const method = els.mockMethod.value || 'ALL';
  const matchType = els.mockMatchType.value || 'contains';
  const status = parseInt(els.mockStatus.value, 10) || 200;
  const statusText = els.mockStatusText.value.trim() || 'OK';
  const delayMs = parseInt(els.mockDelay.value, 10) || 0;
  const body = els.mockBody.value.trim();
  let headers = null;

  try {
    const rawH = els.mockHeaders.value.trim();
    if (rawH) headers = JSON.parse(rawH);
  } catch (_) {
    showToast('Headers must be valid JSON');
    return;
  }

  chrome.runtime.sendMessage({
    action: 'addMock', tabId: state.tabId,
    mock: { method, matchType, pattern, status, statusText, delayMs, headers, body },
  }, res => {
    state.mocks = res?.mocks || state.mocks;
    updateMocksChip();
    els.mockPattern.value = '';
    els.mockStatus.value = '200';
    els.mockStatusText.value = 'OK';
    els.mockDelay.value = '0';
    els.mockHeaders.value = '';
    els.mockBody.value = '';
    renderMocksList();
    showToast('Advanced mock rule added — active on matching requests');
  });
}

/* ── List ── */
function renderList() {
  const list = filterRequests();
  const newHash = list.map((r) =>
    `${r.id}:${r.statusCode || ''}:${r.mocked ? 1 : 0}:${isUrlBlocked(r.url) ? 1 : 0}:${state.selectedId}`
  ).join('|') + '|' + state.blockedUrls.join(',');
  if (newHash === state.listHash) return;
  state.listHash = newHash;

  const scrollTop = els.list.scrollTop;

  const countMap = {};
  state.all.forEach((r) => {
    if (r.type !== 'fetch' && r.type !== 'xhr') return;
    const key = r.method + '|' + normUrl(r.url);
    countMap[key] = (countMap[key] || 0) + 1;
  });

  if (!list.length) {
    els.list.innerHTML = `<div class="empty" style="height:auto;padding:48px 20px;">
      <p>${state.all.length ? 'No matches' : 'Waiting…'}</p>
      <small>${state.all.length ? 'Try a different filter' : 'Reload or interact with the page'}</small>
    </div>`;
    return;
  }

  els.list.innerHTML = list.map((r) => {
    const active = r.id === state.selectedId ? ' active' : '';
    const isBlocked = isUrlBlocked(r.url);
    const blocked = isBlocked ? ' blocked' : '';
    const sClass = statusClassOf(r);
    const sText = statusLabel(r);
    const tMs = r.responseTime != null ? Math.round(r.responseTime) : null;
    const tClass = tMs == null ? '' : tMs < 100 ? ' time-fast' : tMs < 500 ? ' time-medium' : ' time-slow';
    const tText = tMs != null ? tMs + ' ms' : '';
    const isDOM = r.type === 'dom-event' || r.type === 'error';
    const display = isDOM
      ? escHtml(r.target || r.event || r.url)
      : escHtml(shortUrl(r.url));
    const titleAttr = escAttr(r.url);
    const key = r.method + '|' + normUrl(r.url);
    const cnt = (!isDOM && countMap[key] > 1) ? `<span class="call-count">×${countMap[key]}</span>` : '';
    const blockedChip = isBlocked ? `<span class="blocked-chip">BLOCKED</span>` : '';
    const mockedChip = r.mocked ? `<span class="mocked-chip">MOCK</span>` : '';
    return `
      <div class="request-item${active}${blocked}" data-id="${r.id}">
        <div class="request-row">
          <span class="method-badge ${r.method}">${r.method}</span>
          <span class="url-display" title="${titleAttr}">${display}</span>
          ${cnt}
          <span class="status-badge ${sClass}">${sText}</span>
        </div>
        <div class="request-meta">
          <span>${r.type}</span>
          ${r.event ? `<span>${escHtml(r.event)}</span>` : ''}
          ${tText ? `<span class="${tClass.trim()}">${tText}</span>` : ''}
          ${mockedChip}${blockedChip}
        </div>
      </div>`;
  }).join('');

  els.list.querySelectorAll('.request-item').forEach((el) => {
    el.addEventListener('click', () => {
      state.selectedId = Number(el.dataset.id);
      renderList(); renderDetail();
    });
  });

  if (state.autoScroll) {
    els.list.scrollTop = els.list.scrollHeight;
  } else {
    els.list.scrollTop = scrollTop;
  }
}

function filterRequests() {
  const q = els.search.value.trim().toLowerCase();
  const m = els.method.value;
  const s = els.status.value;
  const t = els.type.value;
  return state.all.filter((r) => {
    if (q) {
      const hay = [r.url, r.method, r.statusCode || '', r.target || '', r.event || '', r.error || '']
        .join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (m && r.method !== m) return false;
    if (t && r.type !== t) return false;
    if (s) {
      const c = statusClassOf(r);
      if (s === 'pending') { if (c !== 'pending') return false; }
      else if (c !== 's' + s) return false;
    }
    return true;
  });
}

let _lastDetailKey = '';
function renderDetail() {
  const req = state.all.find((r) => r.id === state.selectedId);
  if (!req) {
    els.detailEmpty.style.display = 'flex';
    els.detailView.classList.add('hidden');
    _lastDetailKey = '';
    return;
  }
  els.detailEmpty.style.display = 'none';
  els.detailView.classList.remove('hidden');

  const bodySig = typeof req.responseBody === 'string' ? req.responseBody.length : JSON.stringify(req.responseBody || '').length;
  const detailKey = `${req.id}_${state.tab}_${req.timestamp}_${req.responseTime}_${req.statusCode}_${bodySig}`;

  if (_lastDetailKey === detailKey && els.tabPanels.children.length > 0) {
    // Content is identical — do not replace innerHTML to avoid resetting user scroll position!
    return;
  }

  const savedPanelScrollTop = els.tabPanels.scrollTop;
  const savedCodeScrollTop = els.tabPanels.querySelector('.code')?.scrollTop || 0;
  _lastDetailKey = detailKey;

  els.detailMethod.textContent = req.method;
  els.detailMethod.className = 'method-badge ' + req.method;
  els.detailUrl.textContent = req.url;
  els.detailUrl.title = req.url;

  const isNetwork = req.type === 'fetch' || req.type === 'xhr';
  const isBlocked = isUrlBlocked(req.url);
  if (isNetwork) {
    const blockLabel = isBlocked ? 'Unblock URL' : 'Block URL';
    const blockClass = isBlocked ? 'unblock' : 'block';
    const normPattern = normUrl(req.url);
    els.detailActions.innerHTML = `
      <button class="action-btn recall" data-action="recall">▶ Recall</button>
      <button class="action-btn edit" data-action="edit">✎ Edit</button>
      <button class="action-btn" data-action="mock">⚡ Mock</button>
      <button class="action-btn ai-action" data-action="ai">✦ Explain</button>
      <button class="action-btn ai-action" data-action="aiMock">✦ AI Mock</button>
      <button class="action-btn ${blockClass}" data-action="${isBlocked ? 'unblock' : 'block'}" data-url="${escAttr(req.url)}">${blockLabel}</button>`;
    els.detailActions.dataset.normPattern = normPattern;
    els.detailActions.querySelectorAll('.action-btn').forEach((btn) => {
      btn.addEventListener('click', () => handleAction(btn.dataset.action, req));
    });
  } else {
    els.detailActions.innerHTML = '<button class="action-btn ai-action" data-action="ai">✦ Explain</button>';
    els.detailActions.querySelector('[data-action="ai"]').addEventListener('click', () => askAiAboutRequest(req));
  }

  const isWS = req.type === 'websocket';
  const isDOM = req.type === 'dom-event' || req.type === 'error';
  const isGQL = isGraphQL(req);

  els.tabs.querySelectorAll('.tab').forEach((t) => {
    const name = t.dataset.tab;
    if (isWS)        t.hidden = name === 'curl' || name === 'fetch' || name === 'graphql';
    else if (isDOM)  t.hidden = name === 'response' || name === 'curl' || name === 'fetch' || name === 'messages' || name === 'graphql';
    else             t.hidden = name === 'messages' || (name === 'graphql' && !isGQL);
  });

  const current = els.tabs.querySelector(`.tab[data-tab="${state.tab}"]`);
  if (!current || current.hidden) {
    state.tab = 'request';
    els.tabs.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'request'));
  }

  let html = '';
  if      (state.tab === 'request')   html = tabRequest(req);
  else if (state.tab === 'response')  html = tabResponse(req);
  else if (state.tab === 'jsonTree')  html = tabJsonTree(req);
  else if (state.tab === 'graphql')   html = tabGraphQL(req);
  else if (state.tab === 'aiChat')    html = tabAiChat();
  else if (state.tab === 'waterfall') html = tabWaterfall();
  else if (state.tab === 'runner')    html = tabRunner();
  else if (state.tab === 'storage')   html = tabStorage();
  else if (state.tab === 'messages')  html = tabMessages(req);
  else if (state.tab === 'curl')      html = tabCurl(req);
  else if (state.tab === 'fetch')     html = tabFetch(req);
  else if (state.tab === 'python')    html = tabPython(req);
  else if (state.tab === 'node')      html = tabNode(req);
  else if (state.tab === 'go')        html = tabGo(req);
  else if (state.tab === 'rust')      html = tabRust(req);
  els.tabPanels.innerHTML = html;
  bindCopyButtons();
  bindTabEvents();

  els.tabPanels.scrollTop = savedPanelScrollTop;
  const codeEl = els.tabPanels.querySelector('.code');
  if (codeEl) codeEl.scrollTop = savedCodeScrollTop;
}

function bindCopyButtons() {
  els.tabPanels.querySelectorAll('.copy-float').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = btn.dataset.copy || btn.parentElement?.querySelector('.code')?.innerText || '';
      if (text) {
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = '✓ Copied!';
          btn.classList.add('copied');
          setTimeout(() => {
            btn.textContent = 'Copy';
            btn.classList.remove('copied');
          }, 1500);
        }).catch(() => {
          showToast('Copy failed');
        });
      }
    });
  });
}

/* ── Per-endpoint actions ── */
function handleAction(action, req) {
  if (action === 'recall') {
    openEditModal(req, false);
  } else if (action === 'edit') {
    openEditModal(req, true);
  } else if (action === 'mock') {
    openMocksModal(normUrl(req.url));
  } else if (action === 'ai') {
    askAiAboutRequest(req);
  } else if (action === 'aiMock') {
    askAiAboutRequest(req, 'mock');
  } else if (action === 'block') {
    chrome.runtime.sendMessage({ action: 'blockUrl', url: req.url }, (res) => {
      state.blockedUrls = res?.blockedUrls || state.blockedUrls;
      showToast('URL blocked — future requests suppressed');
      state.listHash = '';
      renderList(); renderDetail();
    });
  } else if (action === 'unblock') {
    chrome.runtime.sendMessage({ action: 'unblockUrl', url: req.url }, (res) => {
      state.blockedUrls = res?.blockedUrls || state.blockedUrls;
      showToast('URL unblocked');
      state.listHash = '';
      renderList(); renderDetail();
    });
  }
}

function redactHeaders(headers) {
  const safe = {};
  Object.entries(headers || {}).forEach(([key, value]) => {
    safe[key] = /authorization|cookie|set-cookie|proxy-authorization|x-api-key/i.test(key)
      ? '[redacted]' : value;
  });
  return safe;
}

function limitAiValue(value, maxLength) {
  if (value == null) return value;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return text;
  return text.length > maxLength ? text.slice(0, maxLength) + '\n...[truncated]' : text;
}

function aiRequestData(req) {
  return {
    type: req.type, method: req.method, url: req.url, statusCode: req.statusCode,
    statusText: req.statusText, error: req.error, responseTime: req.responseTime,
    requestHeaders: redactHeaders(req.requestHeaders),
    requestBody: limitAiValue(req.requestBody, 8000),
    responseHeaders: redactHeaders(req.responseHeaders),
    responseBody: limitAiValue(req.responseBody, 12000),
    detail: limitAiValue(req.detail, 4000),
    stack: limitAiValue(req.stack, 8000),
    messages: limitAiValue(req.messages, 8000),
  };
}

function askAiAboutRequest(req, mode = 'explain') {
  const task = mode === 'mock'
    ? 'Create a realistic mock response for this captured request. Return valid JSON first, then briefly explain the shape and any assumptions.'
    : 'Explain what this captured event is doing, identify bugs or suspicious behavior, and suggest concrete debugging or improvement steps.';
  const prompt = task + '\n\nCaptured data:\n' + JSON.stringify(aiRequestData(req), null, 2);
  chrome.runtime.sendMessage({ action: 'openAiContext', tabId: state.tabId, prompt }, (res) => {
    if (chrome.runtime.lastError || !res?.ok) showToast('Open the target page before using AI');
  });
}

function askAiAboutPage() {
  const prompt = 'Help me analyze the current page and its captured network activity. Explain the most important behavior, errors, and useful next debugging steps. Current page URL: ' + (state.tabUrl || '(unknown)');
  chrome.runtime.sendMessage({ action: 'openAiContext', tabId: state.tabId, prompt, includePageContext: true }, (res) => {
    if (chrome.runtime.lastError || !res?.ok) showToast('Open the target page before using AI');
  });
}

/* ── Edit/Replay modal ── */
function openEditModal(req, editMode) {
  els.modalTitle.textContent = editMode ? 'Edit & Replay' : 'Replay Request';
  els.editMethod.value = req.method;
  els.editUrl.value = req.url;
  try {
    els.editHeaders.value = req.requestHeaders && Object.keys(req.requestHeaders).length
      ? JSON.stringify(req.requestHeaders, null, 2) : '';
  } catch (_) { els.editHeaders.value = ''; }
  try {
    els.editBody.value = req.requestBody != null
      ? (typeof req.requestBody === 'string' ? req.requestBody : JSON.stringify(req.requestBody, null, 2))
      : '';
  } catch (_) { els.editBody.value = ''; }

  const ro = !editMode;
  els.editMethod.disabled = ro;
  els.editUrl.disabled = ro;
  els.editHeaders.disabled = ro;
  els.editBody.disabled = ro;

  els.replayResult.classList.add('hidden');
  els.replayResult.innerHTML = '';
  els.editModal.classList.remove('hidden');
}
function closeEditModal() { els.editModal.classList.add('hidden'); }

async function sendEditedRequest() {
  const method = els.editMethod.value.trim().toUpperCase();
  let url = els.editUrl.value.trim();
  if (!url) { showToast('URL is required'); return; }

  if (!/^https?:\/\//i.test(url)) {
    const base = state.tabUrl || null;
    if (!base) { showToast('Cannot resolve relative URL — no page origin known'); return; }
    try { url = new URL(url, base).href; } catch (_) { showToast('Invalid URL'); return; }
  }

  let headers = {};
  try {
    const raw = els.editHeaders.value.trim();
    if (raw) headers = JSON.parse(raw);
  } catch (_) { showToast('Headers must be valid JSON'); return; }

  const bodyRaw = els.editBody.value.trim();
  const opts = { method };
  if (Object.keys(headers).length) opts.headers = headers;
  if (bodyRaw && !['GET', 'HEAD'].includes(method)) opts.body = bodyRaw;

  els.modalSend.textContent = 'Sending…';
  els.modalSend.disabled = true;
  els.replayResult.classList.add('hidden');

  /* Replay inside Tab context */
  if (els.editInTab.checked && state.tabId) {
    chrome.runtime.sendMessage({
      action: 'executeInTab',
      tabId: state.tabId,
      fetchArgs: [url, opts],
    }, (res) => {
      els.modalSend.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></svg> Send`;
      els.modalSend.disabled = false;
      if (!res?.ok || !res.result) {
        els.replayResult.innerHTML = `<div class="replay-status fail">Tab Execution Error: ${escHtml(res?.error || 'Failed')}</div>`;
      } else {
        const r = res.result;
        const statusClass = r.ok ? 'ok' : 'fail';
        let pretty = r.text;
        try {
          const t = r.text.trim();
          if ((t[0] === '{' && t.endsWith('}')) || (t[0] === '[' && t.endsWith(']')))
            pretty = JSON.stringify(JSON.parse(t), null, 2);
        } catch (_) {}
        els.replayResult.innerHTML = `<div class="replay-status ${statusClass}">${r.status} ${r.statusText} — ${r.elapsed} ms (Executed in Tab Context)</div>${escHtml(pretty)}`;
      }
      els.replayResult.classList.remove('hidden');
    });
    return;
  }

  try {
    const t0 = performance.now();
    const res = await fetch(url, opts);
    const elapsed = Math.round(performance.now() - t0);
    const text = await res.text();
    let pretty = text;
    try {
      const t = text.trim();
      if ((t[0] === '{' && t.endsWith('}')) || (t[0] === '[' && t.endsWith(']')))
        pretty = JSON.stringify(JSON.parse(t), null, 2);
    } catch (_) {}
    const statusClass = res.ok ? 'ok' : 'fail';
    els.replayResult.innerHTML =
      `<div class="replay-status ${statusClass}">${res.status} ${res.statusText} — ${elapsed} ms</div>${escHtml(pretty)}`;
    els.replayResult.classList.remove('hidden');
  } catch (err) {
    els.replayResult.innerHTML = `<div class="replay-status fail">Error: ${escHtml(String(err))}</div>`;
    els.replayResult.classList.remove('hidden');
  } finally {
    els.modalSend.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></svg> Send`;
    els.modalSend.disabled = false;
  }
}

/* ── Tab renderers ── */
function tabRequest(r) {
  if (r.type === 'dom-event') return tabDomEvent(r);
  if (r.type === 'error')     return tabError(r);
  const head = kvBlock({
    URL: r.url, Method: r.method, Type: r.type,
    ...(r.mocked ? { Mocked: 'yes' } : {}),
    Time: r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : '',
  });
  const headers = kvBlock(r.requestHeaders || {});
  const body = r.requestBody != null ? fmtBody(r.requestBody) : '(none)';
  return section('General', head)
    + section('Request Headers', headers)
    + section('Request Body', `<div class="code">${escHtml(body)}</div>`);
}

function tabDomEvent(r) {
  const head = kvBlock({
    Event: r.event, Target: r.target, Page: r.url,
    Time: r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : '',
  });
  return section('Event', head) + section('Detail', kvBlock(r.detail || {}));
}

function tabError(r) {
  const errorHtml = `<div class="error-banner">${escHtml(r.error || 'Unknown error')}</div>`;
  const head = kvBlock({
    Event: r.event, Page: r.url,
    Time: r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : '',
  });
  return section('Error', errorHtml)
    + section('Context', head)
    + section('Detail', kvBlock(r.detail || {}))
    + section('Stack Trace', `<div class="code">${escHtml(r.stack || '(no stack trace)')}</div>`);
}

function tabResponse(r) {
  const tMs = r.responseTime != null ? Math.round(r.responseTime) : null;
  const tClass = tMs == null ? '' : tMs < 100 ? 'time-fast' : tMs < 500 ? 'time-medium' : 'time-slow';
  const tLabel = tMs != null ? `<span class="${tClass}">${tMs} ms</span>` : '—';
  const head = kvBlock({
    Status: r.statusCode ? `${r.statusCode} ${r.statusText || ''}` : (r.error ? 'Error' : 'Pending'),
    ...(r.error ? { Error: r.error } : {}),
  }).replace('</div>', `<span class="k">Time:</span><span class="v">${tLabel}</span></div>`);
  const headers = kvBlock(r.responseHeaders || {});
  const rawBody = r.responseBody != null ? fmtBody(r.responseBody) : (r.statusCode != null ? '(empty)' : '(pending…)');
  const bodyBlock = `<div class="code-wrap"><button class="copy-float" data-copy="${escAttr(rawBody)}">Copy</button><div class="code">${escHtml(rawBody)}</div></div>`;
  return section('Summary', head) + section('Response Headers', headers) + section('Response Body', bodyBlock);
}

/* ── GraphQL tab ── */
function isGraphQL(r) {
  if (r.type !== 'fetch' && r.type !== 'xhr') return false;
  if (!r.requestBody) return false;
  const body = typeof r.requestBody === 'object' ? r.requestBody : (() => {
    try { return JSON.parse(r.requestBody); } catch (_) { return null; }
  })();
  return body && typeof body.query === 'string';
}

function tabGraphQL(r) {
  const body = typeof r.requestBody === 'object' ? r.requestBody : (() => {
    try { return JSON.parse(r.requestBody || '{}'); } catch (_) { return {}; }
  })();

  const query = body.query || '';
  const vars = body.variables || null;
  const opName = body.operationName || null;

  let html = section('Query',
    `<div class="code-wrap"><button class="copy-float" data-copy="${escAttr(query)}">Copy</button><div class="gql-query">${escHtml(query)}</div></div>`);
  if (opName) html += section('Operation Name', `<div class="code">${escHtml(String(opName))}</div>`);
  if (vars)   html += section('Variables',
    `<div class="code-wrap"><button class="copy-float" data-copy="${escAttr(JSON.stringify(vars, null, 2))}">Copy</button><div class="code">${escHtml(JSON.stringify(vars, null, 2))}</div></div>`);

  /* Parse response */
  const resBody = (() => {
    if (!r.responseBody) return null;
    if (typeof r.responseBody === 'object') return r.responseBody;
    try { return JSON.parse(r.responseBody); } catch (_) { return null; }
  })();

  if (resBody) {
    if (resBody.errors) {
      html += section('Errors',
        `<div class="gql-errors">${escHtml(JSON.stringify(resBody.errors, null, 2))}</div>`);
    }
    if (resBody.data != null) {
      const d = JSON.stringify(resBody.data, null, 2);
      html += section('Response Data',
        `<div class="code-wrap"><button class="copy-float" data-copy="${escAttr(d)}">Copy</button><div class="code">${escHtml(d)}</div></div>`);
    }
  }
  return html;
}

function tabMessages(r) {
  const msgs = r.messages || [];
  if (!msgs.length) {
    return `<div class="empty" style="height:auto;padding:40px 20px;">
      <p>No messages yet</p><small>WebSocket frames will appear as they arrive</small>
    </div>`;
  }
  const rows = msgs.map((m) => {
    const dir = m.dir === 'out' ? 'out' : 'in';
    const data = typeof m.data === 'string' ? m.data : JSON.stringify(m.data, null, 2);
    return `<div class="ws-msg ws-${dir}">
      <span class="ws-dir">${dir === 'out' ? '↑' : '↓'}</span>
      <span class="ws-data">${escHtml(data)}</span>
      <span class="ws-time">${new Date(m.ts).toLocaleTimeString()}</span>
    </div>`;
  }).join('');
  return section(`Messages (${msgs.length})`, `<div class="ws-messages">${rows}</div>`);
}

function tabCurl(r) {
  const curl = buildCurl(r);
  return section('cURL',
    `<div class="code-wrap"><button class="copy-float" data-copy="${escAttr(curl)}">Copy</button><div class="code">${escHtml(curl)}</div></div>`);
}

function tabFetch(r) {
  const code = buildFetch(r);
  return section('fetch() equivalent',
    `<div class="code-wrap"><button class="copy-float" data-copy="${escAttr(code)}">Copy</button><div class="code">${escHtml(code)}</div></div>`);
}

/* ── Section helper ── */
function section(title, bodyHtml) {
  const chevron = `<span class="section-chevron"><svg width="7" height="7" viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,2 4,5 7,2"/></svg></span>`;
  return `<details class="section" open>
    <summary>${chevron}${escHtml(title)}</summary>
    <div class="section-body">${bodyHtml}</div>
  </details>`;
}

/* ── Helpers ── */
function normUrl(url) {
  try { const u = new URL(url); return u.origin + u.pathname; } catch (_) { return url; }
}
function tryUrl(url) {
  try { return new URL(url); } catch (_) { return null; }
}
function isUrlBlocked(url) {
  return state.blockedUrls.includes(normUrl(url));
}
function statusClassOf(r) {
  if (r.type === 'dom-event') return 'dom';
  if (r.type === 'error') return 'err';
  if (r.error) return 's5';
  if (!r.statusCode) return 'pending';
  const c = Math.floor(r.statusCode / 100);
  return c >= 2 && c <= 5 ? 's' + c : 'pending';
}
function statusLabel(r) {
  if (r.type === 'dom-event') return r.event ? r.event.slice(0, 4).toUpperCase() : 'EVT';
  if (r.type === 'error') return 'ERR';
  return r.statusCode || (r.error ? 'ERR' : '…');
}
function shortUrl(url, n = 80) {
  try {
    const u = new URL(url);
    const s = u.host + u.pathname + u.search;
    return s.length > n ? s.slice(0, n) + '…' : s;
  } catch (_) { return url.length > n ? url.slice(0, n) + '…' : url; }
}
function escHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escAttr(s) { return escHtml(s); }
function fmtBody(v) {
  if (v == null) return '';
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return '';
    if ((t[0] === '{' && t.endsWith('}')) || (t[0] === '[' && t.endsWith(']'))) {
      try { return JSON.stringify(JSON.parse(t), null, 2); } catch (_) {}
    }
    return v;
  }
  try { return JSON.stringify(v, null, 2); } catch (_) { return String(v); }
}
function kvBlock(obj) {
  const keys = Object.keys(obj || {}).filter((k) => obj[k] !== '' && obj[k] != null);
  if (!keys.length) return `<div class="code">(none)</div>`;
  return `<div class="kv">${keys.map((k) =>
    `<span class="k">${escHtml(k)}:</span><span class="v">${escHtml(String(obj[k]))}</span>`
  ).join('')}</div>`;
}

const SHELL_QUOTE = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
function buildCurl(r) {
  const lines = [`curl -X ${r.method}`];
  for (const [k, v] of Object.entries(r.requestHeaders || {})) {
    if (/^(content-length|host|connection)$/i.test(k)) continue;
    lines.push(`  -H ${SHELL_QUOTE(`${k}: ${v}`)}`);
  }
  if (r.requestBody != null && !['GET', 'HEAD'].includes(r.method)) {
    const body = typeof r.requestBody === 'string' ? r.requestBody : JSON.stringify(r.requestBody);
    lines.push(`  --data-raw ${SHELL_QUOTE(body)}`);
  }
  lines.push(`  ${SHELL_QUOTE(r.url)}`);
  return lines.join(' \\\n');
}
function buildFetch(r) {
  const opts = { method: r.method };
  if (r.requestHeaders && Object.keys(r.requestHeaders).length) opts.headers = r.requestHeaders;
  if (r.requestBody != null && !['GET', 'HEAD'].includes(r.method)) {
    opts.body = typeof r.requestBody === 'string' ? r.requestBody : JSON.stringify(r.requestBody);
  }
  return `const res = await fetch(${JSON.stringify(r.url)}, ${JSON.stringify(opts, null, 2)});
const data = await res.json();
console.log(data);`;
}
/* ── Interactive JSON Tree ── */
function tabJsonTree(r) {
  const body = r.responseBody || r.requestBody;
  if (!body) return section('Interactive JSON Tree', '<div class="code">(no response or request body)</div>');

  let obj = body;
  if (typeof body === 'string') {
    try { obj = JSON.parse(body); } catch (_) {
      return section('Interactive JSON Tree', '<div class="code">(body is not valid JSON)</div>');
    }
  }

  const treeHtml = `<div class="json-tree">${buildJsonTreeHtml(obj, '$')}</div>`;
  return section('Interactive JSON Tree', treeHtml);
}

function buildJsonTreeHtml(val, keyPath) {
  if (val === null) return `<span class="json-null">null</span>`;
  if (typeof val === 'boolean') return `<span class="json-boolean">${val}</span>`;
  if (typeof val === 'number') return `<span class="json-number">${val}</span>`;
  if (typeof val === 'string') return `<span class="json-string">"${escHtml(val)}"</span>`;

  const isArr = Array.isArray(val);
  const keys = Object.keys(val);
  if (!keys.length) return isArr ? '[]' : '{}';

  let html = `<div class="json-expanded"><span class="json-toggle"></span> ${isArr ? '[' : '{'}`;
  for (const k of keys) {
    const subPath = isArr ? `${keyPath}[${k}]` : `${keyPath}.${k}`;
    html += `<div class="json-tree-node"><span class="json-key" title="Click to copy path: ${escAttr(subPath)}" data-path="${escAttr(subPath)}">${escHtml(k)}</span>: ${buildJsonTreeHtml(val[k], subPath)}</div>`;
  }
  html += `<div>${isArr ? ']' : '}'}</div></div>`;
  return html;
}

/* ── Code Generators ── */
function tabPython(r) {
  const headers = JSON.stringify(r.requestHeaders || {}, null, 4);
  const body = r.requestBody ? JSON.stringify(r.requestBody, null, 4) : 'None';
  const py = `import requests

url = "${r.url}"
headers = ${headers}
data = ${body}

response = requests.${r.method.toLowerCase()}(url, headers=headers, json=data if isinstance(data, dict) else None, data=data if isinstance(data, str) else None)
print(response.status_code)
print(response.text)
`;
  return section('Python (requests)', `<div class="code-wrap"><button class="copy-float" data-copy="${escAttr(py)}">Copy</button><div class="code">${escHtml(py)}</div></div>`);
}

function tabNode(r) {
  const opts = {
    method: r.method,
    url: r.url,
    headers: r.requestHeaders || {},
    ...(r.requestBody ? { data: r.requestBody } : {})
  };
  const node = `const axios = require('axios');

const config = ${JSON.stringify(opts, null, 2)};

axios(config)
  .then(response => console.log(JSON.stringify(response.data)))
  .catch(error => console.error(error));
`;
  return section('Node.js (Axios)', `<div class="code-wrap"><button class="copy-float" data-copy="${escAttr(node)}">Copy</button><div class="code">${escHtml(node)}</div></div>`);
}

function tabGo(r) {
  const hasBody = r.requestBody && !['GET', 'HEAD'].includes(r.method);
  const bodyStr = hasBody ? (typeof r.requestBody === 'string' ? r.requestBody : JSON.stringify(r.requestBody)) : '';
  const go = `package main

import (
	"fmt"
	"io"
	"net/http"
	${hasBody ? '"strings"' : ''}
)

func main() {
	url := "${r.url}"
	${hasBody ? `payload := strings.NewReader(\`${bodyStr}\`)` : 'var payload io.Reader = nil'}
	req, _ := http.NewRequest("${r.method}", url, payload)

${Object.entries(r.requestHeaders || {}).map(([k, v]) => `\treq.Header.Add("${k}", "${v}")`).join('\n')}

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		fmt.Println(err)
		return
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	fmt.Println(string(body))
}
`;
  return section('Go (net/http)', `<div class="code-wrap"><button class="copy-float" data-copy="${escAttr(go)}">Copy</button><div class="code">${escHtml(go)}</div></div>`);
}

function tabRust(r) {
  const hasBody = r.requestBody && !['GET', 'HEAD'].includes(r.method);
  const bodyStr = hasBody ? (typeof r.requestBody === 'string' ? r.requestBody : JSON.stringify(r.requestBody)) : '';
  const rust = `use reqwest::header::HeaderMap;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std.error.Error>> {
    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
${Object.entries(r.requestHeaders || {}).map(([k, v]) => `    headers.insert("${k}", "${v}".parse()?);`).join('\n')}

    let res = client.${r.method.toLowerCase()}("${r.url}")
        .headers(headers)
        ${hasBody ? `.body(\`${bodyStr}\`)` : ''}
        .send()
        .await?;

    println!("Status: {}", res.status());
    println!("Body: {}", res.text().await?);
    Ok(())
}
`;
  return section('Rust (reqwest)', `<div class="code-wrap"><button class="copy-float" data-copy="${escAttr(rust)}">Copy</button><div class="code">${escHtml(rust)}</div></div>`);
}

/* ── Side-by-Side Diff Modal ── */
function openDiffModal() {
  const reqs = state.all;
  if (reqs.length < 2) {
    showToast('Need at least 2 captured requests to compare');
    return;
  }

  const opts = reqs.map((r, idx) => `<option value="${r.id}">${idx + 1}. [${r.method}] ${shortUrl(r.url)} (${r.statusCode || 'pending'})</option>`).join('');
  els.diffReqA.innerHTML = opts;
  els.diffReqB.innerHTML = opts;

  els.diffReqA.selectedIndex = 0;
  els.diffReqB.selectedIndex = Math.min(1, reqs.length - 1);

  renderDiff();
  els.diffModal.classList.remove('hidden');
}

function closeDiffModal() {
  els.diffModal.classList.add('hidden');
}

function renderDiff() {
  const idA = Number(els.diffReqA.value);
  const idB = Number(els.diffReqB.value);
  const reqA = state.all.find(r => r.id === idA);
  const reqB = state.all.find(r => r.id === idB);

  if (!reqA || !reqB) return;

  els.diffPaneA.innerHTML = `<h4>Request A: [${reqA.method}] ${escHtml(reqA.url)}</h4>` + buildDiffContent(reqA, reqB);
  els.diffPaneB.innerHTML = `<h4>Request B: [${reqB.method}] ${escHtml(reqB.url)}</h4>` + buildDiffContent(reqB, reqA);
}

function buildDiffContent(source, target) {
  let html = '<div><strong>Headers:</strong></div>';
  const sHeaders = source.requestHeaders || {};
  const tHeaders = target.requestHeaders || {};

  for (const [k, v] of Object.entries(sHeaders)) {
    const isDiff = tHeaders[k] !== v;
    const cls = isDiff ? (tHeaders[k] == null ? 'removed' : 'added') : 'equal';
    html += `<div class="diff-line ${cls}">${escHtml(k)}: ${escHtml(String(v))}</div>`;
  }

  html += '<div style="margin-top:8px;"><strong>Body:</strong></div>';
  const sBody = typeof source.responseBody === 'object' ? JSON.stringify(source.responseBody, null, 2) : String(source.responseBody || '');
  const tBody = typeof target.responseBody === 'object' ? JSON.stringify(target.responseBody, null, 2) : String(target.responseBody || '');

  const isBodyDiff = sBody !== tBody;
  html += `<div class="diff-line ${isBodyDiff ? 'added' : 'equal'}">${escHtml(sBody || '(empty)')}</div>`;
  return html;
}

/* ── Waterfall Gantt Timeline & Summary ── */
function tabWaterfall() {
  const apiReqs = state.all.filter((r) => r.type === 'fetch' || r.type === 'xhr');
  if (!apiReqs.length) return section('Network Waterfall & Performance Studio', '<div class="empty"><p>No fetch/XHR traffic captured yet</p></div>');

  const minTs = Math.min(...apiReqs.map((r) => r.timestamp || Date.now()));
  const maxTs = Math.max(...apiReqs.map((r) => (r.timestamp || Date.now()) + (r.responseTime || 1)));
  const totalDuration = Math.max(1, maxTs - minTs);

  let totalBytes = 0;
  let totalTime = 0;
  let errorCount = 0;

  apiReqs.forEach((r) => {
    const resText = typeof r.responseBody === 'string' ? r.responseBody : JSON.stringify(r.responseBody || '');
    totalBytes += (resText.length || 0);
    totalTime += (r.responseTime || 0);
    if ((r.statusCode && r.statusCode >= 400) || r.error) errorCount++;
  });

  const avgLatency = Math.round(totalTime / apiReqs.length);
  const errorPct = Math.round((errorCount / apiReqs.length) * 100);
  const mbTransferred = (totalBytes / (1024 * 1024)).toFixed(2);

  let html = `
    <div class="waterfall-summary">
      <div class="stat-card"><span class="stat-val">${apiReqs.length}</span><span class="stat-lbl">Requests</span></div>
      <div class="stat-card"><span class="stat-val">${mbTransferred} MB</span><span class="stat-lbl">Transferred</span></div>
      <div class="stat-card"><span class="stat-val">${avgLatency} ms</span><span class="stat-lbl">Avg Latency</span></div>
      <div class="stat-card"><span class="stat-val" style="color:${errorCount > 0 ? '#ef4444' : '#22c55e'}">${errorPct}%</span><span class="stat-lbl">Error Rate</span></div>
    </div>
    <div class="waterfall-list">
  `;

  function getApiOrEventName(r) {
    if (r.type === 'dom-event') return `[Event] ${r.name || r.target || 'DOM Event'}`;
    if (!r.url) return r.name || 'Unknown Endpoint';
    try {
      const u = new URL(r.url);
      let path = u.pathname;
      if (path.length > 24) path = '...' + path.slice(-21);
      if (u.search && u.search.length > 1) {
        const q = u.searchParams.get('op') || u.searchParams.get('operationName') || u.searchParams.get('action');
        if (q) path += ` (${q})`;
      }
      return path || u.hostname;
    } catch (_) {
      return r.url.slice(0, 25);
    }
  }

  apiReqs.forEach((r) => {
    const startOffset = Math.max(0, (r.timestamp || minTs) - minTs);
    const leftPct = Math.min(95, (startOffset / totalDuration) * 100);
    const dur = Math.max(1, r.responseTime || 1);
    const widthPct = Math.min(100 - leftPct, Math.max(2, (dur / totalDuration) * 100));
    const speedClass = dur < 100 ? 'fast' : dur < 500 ? 'medium' : 'slow';
    const apiName = getApiOrEventName(r);

    html += `
      <div class="waterfall-item">
        <span class="method-badge ${r.method}">${r.method}</span>
        <span class="waterfall-api-name" title="${escAttr(r.url)}">${escHtml(apiName)}</span>
        <div class="waterfall-track">
          <div class="waterfall-bar ${speedClass}" style="left:${leftPct.toFixed(1)}%; width:${widthPct.toFixed(1)}%;" title="${dur} ms"></div>
        </div>
        <span class="url-display" style="text-align:right;">${Math.round(dur)} ms</span>
      </div>
    `;
  });

  html += `</div>`;
  return section('Network Waterfall & Performance Studio', html);
}

function tabAiChat() {
  const host = document.getElementById('groq-chat-widget-host');
  if (host && host.shadowRoot) {
    const p = host.shadowRoot.getElementById('gcbPanel');
    if (p) p.classList.add('open');
  }
  return section('Multi-AI Assistant Chat', '<div class="empty" style="padding:24px;"><p>🤖 Multi-AI Assistant Chatbot is active in this Extension window.</p><small>Use the AI Chat drawer on the right to prompt Gemini, Groq, or ChatGPT models, switch date-filtered memory, and audit captured traffic.</small></div>');
}

/* ── API Runner & Assertion Suite ── */
function tabRunner() {
  const apiReqs = state.all.filter((r) => r.type === 'fetch' || r.type === 'xhr');
  if (!apiReqs.length) return section('API Test Suite Runner', '<div class="empty"><p>No fetch/XHR traffic captured to run</p></div>');

  let html = `
    <div style="margin-bottom:12px; display:flex; gap:8px;">
      <button class="btn accent" id="runAllTestsBtn">▶ Run Test Suite (${apiReqs.length} endpoints)</button>
      <button class="btn" id="exportK6Btn">⚡ Export as K6 Load Test Script</button>
    </div>
    <div id="runnerResults" class="runner-results" style="display:flex; flex-direction:column; gap:6px;">
      <div class="empty"><p>Click 'Run Test Suite' to execute automated assertions.</p></div>
    </div>
  `;
  return section('API Test Suite Runner & Assertions', html);
}

function runTestSuite() {
  const container = document.getElementById('runnerResults');
  if (!container) return;
  const apiReqs = state.all.filter((r) => r.type === 'fetch' || r.type === 'xhr');

  container.innerHTML = apiReqs.map((r, idx) => {
    const isOk = !r.error && (r.statusCode ? r.statusCode < 400 : true);
    const badge = isOk ? '<span class="status-badge s2">PASS</span>' : '<span class="status-badge s5">FAIL</span>';
    return `
      <div class="header-rule-item">
        ${badge}
        <div class="header-rule-info">
          <strong>#${idx + 1} [${r.method}]</strong> ${escHtml(r.url)}
          <div class="mock-meta">Status: ${r.statusCode || '200'} · Time: ${r.responseTime ? Math.round(r.responseTime) + 'ms' : '1ms'}</div>
        </div>
      </div>
    `;
  }).join('');
  showToast(`Ran ${apiReqs.length} test assertions`);
}

function exportK6Script() {
  const apiReqs = state.all.filter((r) => r.type === 'fetch' || r.type === 'xhr');
  if (!apiReqs.length) return showToast('No requests to export');

  const k6 = `import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '30s',
};

export default function () {
${apiReqs.map((r) => `  {
    const res = http.${r.method.toLowerCase()}('${r.url}');
    check(res, { 'status is 200': (r) => r.status === 200 });
  }`).join('\n')}
  sleep(1);
}`;

  dl(new Blob([k6], { type: 'text/javascript' }), `k6-test-${Date.now()}.js`);
  showToast('Exported K6 load test script');
}

/* ── Storage Manager ── */
function tabStorage() {
  let html = `
    <div style="margin-bottom:10px; display:flex; gap:8px;">
      <button class="btn" id="refreshStorageBtn">🔄 Refresh Storage</button>
      <button class="btn danger" id="clearCookiesBtn">🗑️ Clear Domain Cookies</button>
    </div>
    <div id="storageViewContent">
      <div class="code">Click 'Refresh Storage' to load domain Cookies and LocalStorage</div>
    </div>
  `;
  return section('Domain Storage & Cookie Manager', html);
}

function refreshStorageView() {
  const container = document.getElementById('storageViewContent');
  if (!container) return;

  if (chrome.cookies && state.tabUrl) {
    try {
      const u = new URL(state.tabUrl);
      chrome.cookies.getAll({ domain: u.hostname }, (cookies) => {
        if (!cookies || !cookies.length) {
          container.innerHTML = `<div class="empty"><p>No cookies found for domain ${escHtml(u.hostname)}</p></div>`;
          return;
        }
        container.innerHTML = `<div class="kv">${cookies.map((c) =>
          `<span class="k">${escHtml(c.name)}:</span><span class="v">${escHtml(c.value)}</span>`
        ).join('')}</div>`;
      });
    } catch (_) {
      container.innerHTML = `<div class="code">Domain storage loaded.</div>`;
    }
  } else {
    container.innerHTML = `<div class="code">Domain storage inspection active.</div>`;
  }
}

function clearDomainCookies() {
  if (!state.tabUrl || !chrome.cookies) return showToast('Cannot inspect domain cookies');
  try {
    const u = new URL(state.tabUrl);
    chrome.cookies.getAll({ domain: u.hostname }, (cookies) => {
      (cookies || []).forEach((c) => {
        const url = (c.secure ? 'https://' : 'http://') + c.domain + c.path;
        chrome.cookies.remove({ url, name: c.name });
      });
      showToast(`Cleared ${cookies?.length || 0} cookies for ${u.hostname}`);
      refreshStorageView();
    });
  } catch (_) {}
}

/* ── Header Rewriter (ModHeader) UI ── */
function openHeaderRulesModal() {
  chrome.runtime.sendMessage({ action: 'getHeaderRules' }, (res) => {
    state.headerRules = res?.headerRules || [];
    renderHeaderRulesList();
    els.headerRulesModal.classList.remove('hidden');
  });
}
function closeHeaderRulesModal() { els.headerRulesModal.classList.add('hidden'); }

function renderHeaderRulesList() {
  if (!state.headerRules.length) {
    els.headerRulesList.innerHTML = `<div class="mocks-empty">No header rewriter rules. Add one below.</div>`;
    return;
  }
  els.headerRulesList.innerHTML = state.headerRules.map((r) => `
    <div class="header-rule-item${r.enabled ? '' : ' disabled'}">
      <label class="mock-toggle-wrap">
        <input type="checkbox" class="header-toggle-input" data-id="${r.id}" ${r.enabled ? 'checked' : ''} />
        <span class="mock-toggle-track"></span>
      </label>
      <div class="header-rule-info">
        <span class="header-rule-action">${r.action}</span> <strong>${escHtml(r.headerName)}</strong>: ${escHtml(r.headerValue || '(removed)')}
        <div class="header-rule-pattern">Pattern: ${escHtml(r.pattern)} [${r.method}]</div>
      </div>
      <button class="mock-delete header-rule-delete" data-id="${r.id}">×</button>
    </div>
  `).join('');

  els.headerRulesList.querySelectorAll('.header-toggle-input').forEach((cb) => {
    cb.addEventListener('change', () => {
      chrome.runtime.sendMessage({ action: 'toggleHeaderRule', id: Number(cb.dataset.id) }, (res) => {
        state.headerRules = res?.headerRules || state.headerRules;
        renderHeaderRulesList();
      });
    });
  });

  els.headerRulesList.querySelectorAll('.header-rule-delete').forEach((btn) => {
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'removeHeaderRule', id: Number(btn.dataset.id) }, (res) => {
        state.headerRules = res?.headerRules || state.headerRules;
        renderHeaderRulesList();
        showToast('Header rule removed');
      });
    });
  });
}

function saveHeaderRule() {
  const pattern = els.headerRulePattern.value.trim();
  const name = els.headerRuleName.value.trim();
  if (!pattern || !name) return showToast('Pattern and Header Name required');

  const action = els.headerRuleAction.value;
  const method = els.headerRuleMethod.value;
  const matchType = els.headerRuleMatchType.value;
  const value = els.headerRuleValue.value.trim();

  chrome.runtime.sendMessage({
    action: 'addHeaderRule',
    rule: { action, method, matchType, pattern, headerName: name, headerValue: value }
  }, (res) => {
    state.headerRules = res?.headerRules || state.headerRules;
    els.headerRulePattern.value = '';
    els.headerRuleName.value = '';
    els.headerRuleValue.value = '';
    renderHeaderRulesList();
    showToast('Header rule saved & active');
  });
}

/* ── AI Security Audit Modal ── */
function openAuditModal() {
  els.auditModal.classList.remove('hidden');
}
function closeAuditModal() { els.auditModal.classList.add('hidden'); }

async function runAiSecurityAudit() {
  const apiReqs = state.all.filter((r) => r.type === 'fetch' || r.type === 'xhr');
  if (!apiReqs.length) return showToast('No captured requests to scan');

  els.auditContent.innerHTML = `<div class="empty"><p>⚡ Scanning ${apiReqs.length} captured network endpoints for OWASP vulnerabilities & secret leaks...</p></div>`;
  els.startAuditBtn.disabled = true;

  const sampleData = apiReqs.slice(0, 15).map((r) => ({
    method: r.method,
    url: r.url,
    statusCode: r.statusCode,
    requestHeaders: redactHeaders(r.requestHeaders),
    responseHeaders: redactHeaders(r.responseHeaders),
    responseSnippet: limitAiValue(r.responseBody, 500)
  }));

  const prompt = `Perform a thorough Network Security & OWASP Vulnerability Audit on these captured HTTP endpoints.
Analyze for:
1. Exposed Secrets & Tokens (JWTs, API Keys, Passwords)
2. Missing Security Headers (CSP, HSTS, CORS Access-Control-Allow-Origin: *)
3. PII & Sensitive Data Leaks
4. OWASP API Security Top 10 vulnerabilities

Format your findings clearly using Markdown with severity badges:
### 🚨 Critical Vulnerabilities
### ⚠️ Warnings & Insecure Configurations
### 💡 Security Hardening Tips

Captured Traffic Data:
` + JSON.stringify(sampleData, null, 2);

  chrome.runtime.sendMessage({
    action: 'aiCompletion',
    provider: 'gemini',
    apiKey: '',
    model: 'gemini-3.8-flash',
    messages: [{ role: 'user', content: prompt }]
  }, (res) => {
    els.startAuditBtn.disabled = false;
    if (chrome.runtime.lastError || !res?.ok) {
      els.auditContent.innerHTML = `<div class="error-banner">Audit Error: ${escHtml(res?.error || 'Failed to complete security audit. Ensure API key is configured in Settings.')}</div>`;
      return;
    }
    els.auditContent.innerHTML = renderMarkdown(res.result.reply);
  });
}

function bindTabEvents() {
  const runBtn = document.getElementById('runAllTestsBtn');
  if (runBtn) runBtn.addEventListener('click', runTestSuite);
  const k6Btn = document.getElementById('exportK6Btn');
  if (k6Btn) k6Btn.addEventListener('click', exportK6Script);
  const refStore = document.getElementById('refreshStorageBtn');
  if (refStore) refStore.addEventListener('click', refreshStorageView);
  const clrCook = document.getElementById('clearCookiesBtn');
  if (clrCook) clrCook.addEventListener('click', clearDomainCookies);
}
})();