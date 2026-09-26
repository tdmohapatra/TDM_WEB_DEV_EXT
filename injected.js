/* Runs in the page's MAIN world — hooks fetch / XHR / WebSocket / DOM events / errors */
(function () {
  if (window.__API_INSPECTOR__) return;
  window.__API_INSPECTOR__ = true;

  let id = 0;
  const MAX_BODY = 8000;

  /* ── Mock rules ── */
  if (!window.__API_MOCK_RULES__) window.__API_MOCK_RULES__ = [];
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data?.__apiMockRules) return;
    window.__API_MOCK_RULES__ = e.data.mocks || [];
  });

  function findMock(url, method = 'GET') {
    const rules = window.__API_MOCK_RULES__;
    if (!rules.length) return null;
    const norm = (() => { try { const u = new URL(url); return u.origin + u.pathname; } catch (_) { return url; } })();
    const reqMethod = String(method).toUpperCase();

    return rules.find(m => {
      if (!m.enabled) return false;

      /* Method match */
      if (m.method && m.method !== 'ALL' && m.method !== reqMethod) return false;

      /* Pattern match */
      const matchType = m.matchType || 'contains';
      if (matchType === 'exact') {
        return m.pattern === norm || m.pattern === url;
      }
      if (matchType === 'regex') {
        try {
          return new RegExp(m.pattern, 'i').test(url);
        } catch (_) {
          return url.includes(m.pattern);
        }
      }
      /* contains */
      return url.includes(m.pattern) || norm.includes(m.pattern);
    }) || null;
  }

  /* ── Core helpers ── */
  const post = (payload) => {
    try { window.postMessage({ __apiInspector: true, payload }, '*'); } catch (_) {}
  };

  const truncate = (s, n = MAX_BODY) =>
    typeof s === 'string' && s.length > n ? s.slice(0, n) + `\n… [${s.length - n} chars truncated]` : s;

  const tryJson = (text) => {
    if (typeof text !== 'string') return text;
    const t = text.trim();
    if (!t) return '';
    if ((t[0] === '{' && t.endsWith('}')) || (t[0] === '[' && t.endsWith(']'))) {
      try { return JSON.parse(t); } catch (_) {}
    }
    return truncate(text);
  };

  const serializeBody = (body) => {
    if (body == null) return null;
    if (typeof body === 'string') return truncate(body, 2000);
    if (body instanceof FormData) {
      const o = {};
      for (const [k, v] of body.entries()) o[k] = v instanceof File ? `[File: ${v.name}]` : v;
      return o;
    }
    if (body instanceof URLSearchParams) return Object.fromEntries(body.entries());
    if (body instanceof Blob) return `[Blob: ${body.type || 'binary'}, ${body.size}B]`;
    if (body instanceof ArrayBuffer) return `[ArrayBuffer: ${body.byteLength}B]`;
    try { return JSON.parse(JSON.stringify(body)); } catch (_) { return String(body); }
  };

  const headersToObject = (h) => {
    if (!h) return {};
    if (h instanceof Headers) { const o = {}; h.forEach((v, k) => (o[k] = v)); return o; }
    if (Array.isArray(h)) return Object.fromEntries(h);
    return { ...h };
  };

  /* ── fetch ────────────────────────────────────── */
  const _fetch = window.fetch;
  if (_fetch) {
    window.fetch = function (input, init = {}) {
      const rid = ++id;
      const start = performance.now();
      let url = '', method = 'GET', headers = {}, body = null;

      try {
        if (input instanceof Request) {
          url = input.url;
          method = init.method || input.method || 'GET';
          headers = headersToObject(input.headers);
          if (init.headers) Object.assign(headers, headersToObject(init.headers));
          body = init.body != null ? init.body : null;
        } else {
          url = typeof input === 'string' ? input : String(input);
          method = init.method || 'GET';
          headers = headersToObject(init.headers);
          body = init.body != null ? init.body : null;
        }
      } catch (_) { url = String(input); }

      /* Mock intercept */
      const mock = findMock(url, method);
      if (mock) {
        const mockBody = mock.body || '';
        const delay = Math.max(0, parseInt(mock.delayMs, 10) || 0);
        const resHeaders = mock.headers || { 'content-type': 'application/json' };
        const req = {
          id: rid, type: 'fetch', method: String(method).toUpperCase(), url,
          requestHeaders: headers, requestBody: serializeBody(body),
          timestamp: Date.now(),
          statusCode: mock.status || 200,
          statusText: (mock.statusText || 'OK') + ' [MOCK]',
          responseTime: delay || 1,
          responseHeaders: resHeaders,
          responseBody: tryJson(mockBody),
          error: null, mocked: true,
        };
        post(req);
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(new Response(mockBody, {
              status: mock.status || 200,
              statusText: mock.statusText || 'OK',
              headers: resHeaders,
            }));
          }, delay);
        });
      }

      const req = {
        id: rid, type: 'fetch',
        method: String(method).toUpperCase(), url,
        requestHeaders: headers, requestBody: serializeBody(body),
        timestamp: Date.now(),
        statusCode: null, statusText: null, responseTime: null,
        responseHeaders: {}, responseBody: null, error: null
      };
      post(req);

      return _fetch.apply(this, arguments).then(
        (res) => {
          req.statusCode = res.status;
          req.statusText = res.statusText;
          req.responseTime = performance.now() - start;
          const rh = {}; res.headers.forEach((v, k) => (rh[k] = v));
          req.responseHeaders = rh;
          post(req);
          try {
            res.clone().text().then((t) => {
              req.responseBody = tryJson(t);
              post(req);
            }).catch(() => {});
          } catch (_) {}
          return res;
        },
        (err) => {
          req.error = err?.message || String(err);
          req.responseTime = performance.now() - start;
          post(req);
          throw err;
        }
      );
    };
  }

  /* ── XHR ────────────────────────────────────── */
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  const _setHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__api = {
      id: ++id, type: 'xhr',
      method: String(method).toUpperCase(), url: String(url),
      requestHeaders: {}, requestBody: null,
      timestamp: Date.now(), _start: performance.now(),
      statusCode: null, statusText: null, responseTime: null,
      responseHeaders: {}, responseBody: null, error: null
    };
    return _open.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (this.__api) this.__api.requestHeaders[name] = value;
    return _setHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const req = this.__api;
    if (!req) return _send.apply(this, arguments);

    req.requestBody = serializeBody(body);
    post({ ...req });

    /* Mock intercept */
    const mock = findMock(req.url, req.method);
    if (mock) {
      const self = this;
      const mockBody = mock.body || '';
      const mockStatus = mock.status || 200;
      const mockStatusText = mock.statusText || 'OK';
      const delay = Math.max(0, parseInt(mock.delayMs, 10) || 0);
      const resHeaders = mock.headers || { 'content-type': 'application/json' };

      req.statusCode = mockStatus;
      req.statusText = mockStatusText + ' [MOCK]';
      req.responseHeaders = resHeaders;
      req.responseBody = tryJson(mockBody);
      req.responseTime = delay || 1;
      req.mocked = true;

      setTimeout(() => {
        try {
          Object.defineProperty(self, 'readyState', { get: () => 4, configurable: true });
          Object.defineProperty(self, 'status', { get: () => mockStatus, configurable: true });
          Object.defineProperty(self, 'statusText', { get: () => mockStatusText, configurable: true });
          Object.defineProperty(self, 'responseText', { get: () => mockBody, configurable: true });
          Object.defineProperty(self, 'response', {
            get: () => self.responseType === 'json' ? tryJson(mockBody) : mockBody,
            configurable: true,
          });
        } catch (_) {}
        post({ ...req });
        self.dispatchEvent(new ProgressEvent('loadend'));
        if (typeof self.onreadystatechange === 'function') self.onreadystatechange();
        if (typeof self.onload === 'function') self.onload(new ProgressEvent('load'));
      }, delay);
      return;
    }

    this.addEventListener('loadend', () => {
      req.statusCode = this.status;
      req.statusText = this.statusText;
      req.responseTime = performance.now() - req._start;
      try {
        (this.getAllResponseHeaders() || '').trim().split(/[\r\n]+/).forEach((line) => {
          const i = line.indexOf(':');
          if (i > 0) req.responseHeaders[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
        });
      } catch (_) {}
      try {
        if (!this.responseType || this.responseType === 'text') req.responseBody = tryJson(this.responseText);
        else if (this.responseType === 'json') req.responseBody = this.response;
        else req.responseBody = `[${this.responseType}]`;
      } catch (_) {}
      post({ ...req });
    }, { once: true });

    this.addEventListener('error', () => {
      req.error = 'Network error';
      post({ ...req });
    }, { once: true });

    return _send.apply(this, arguments);
  };

  /* ── WebSocket ────────────────────────────────── */
  const _WS = window.WebSocket;
  if (_WS) {
    window.WebSocket = new Proxy(_WS, {
      construct(Target, args) {
        const ws = new Target(...args);
        const rid = ++id;
        const req = {
          id: rid, type: 'websocket', method: 'WS', url: String(args[0]),
          requestHeaders: {}, requestBody: null, timestamp: Date.now(),
          statusCode: null, statusText: 'connecting', responseTime: null,
          responseHeaders: {}, responseBody: null, error: null, messages: []
        };
        post({ ...req });
        const t0 = performance.now();

        ws.addEventListener('open', () => {
          req.statusCode = 101; req.statusText = 'open';
          req.responseTime = performance.now() - t0;
          post({ ...req });
        });
        ws.addEventListener('message', (e) => {
          req.messages.push({ dir: 'in', data: typeof e.data === 'string' ? truncate(e.data, 800) : '[binary]', ts: Date.now() });
          if (req.messages.length > 30) req.messages.shift();
          post({ ...req });
        });
        ws.addEventListener('close', (e) => {
          req.statusText = `closed (${e.code})`;
          post({ ...req });
        });
        ws.addEventListener('error', () => {
          req.error = 'WebSocket error'; post({ ...req });
        });

        const _wsSend = ws.send.bind(ws);
        ws.send = function (data) {
          req.messages.push({ dir: 'out', data: typeof data === 'string' ? truncate(data, 800) : '[binary]', ts: Date.now() });
          if (req.messages.length > 30) req.messages.shift();
          post({ ...req });
          return _wsSend(data);
        };
        return ws;
      },
      get: (T, p) => (p === 'prototype' ? T.prototype : T[p])
    });
  }

  /* ── DOM Events ────────────────────────────────── */
  const domEvent = (evtName, method, target, detail) => {
    post({
      id: ++id, type: 'dom-event', method,
      event: evtName, url: location.href, target,
      detail, timestamp: Date.now(),
      statusCode: null, statusText: evtName, responseTime: null,
      requestHeaders: {}, requestBody: null,
      responseHeaders: {}, responseBody: null, error: null
    });
  };

  window.addEventListener('DOMContentLoaded', () => {
    domEvent('DOMContentLoaded', 'LOAD', 'document', {
      readyState: document.readyState,
      title: document.title,
      href: location.href
    });
  });

  window.addEventListener('load', () => {
    domEvent('load', 'LOAD', 'window', {
      readyState: document.readyState,
      title: document.title,
      href: location.href
    });
  });

  window.addEventListener('beforeunload', () => {
    domEvent('beforeunload', 'LOAD', 'window', { href: location.href });
  });

  document.addEventListener('click', (e) => {
    const el = e.target;
    if (!el) return;
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    const elId = el.id || '';
    const cls = typeof el.className === 'string' ? el.className.trim() : '';
    const text = (el.textContent || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    const label = elId ? `#${elId}` : (cls ? `.${cls.split(' ')[0]}` : tag);
    domEvent('click', 'CLICK', label, {
      tag, id: elId || '(none)', class: cls || '(none)',
      text: text || '(none)', x: e.clientX, y: e.clientY
    });
  }, true);

  /* ── JS errors ────────────────────────────────── */
  window.addEventListener('error', (e) => {
    post({
      id: ++id, type: 'error', method: 'ERR',
      event: 'error', url: e.filename || location.href,
      target: e.filename || location.href,
      detail: {
        message: e.message || 'Unknown error',
        source: e.filename || '(inline)',
        line: e.lineno,
        column: e.colno
      },
      error: e.message || 'Unknown error',
      stack: e.error?.stack || '(no stack)',
      timestamp: Date.now(),
      statusCode: null, statusText: 'error', responseTime: null,
      requestHeaders: {}, requestBody: null,
      responseHeaders: {}, responseBody: null
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    const msg = reason instanceof Error ? reason.message : String(reason ?? 'Unhandled rejection');
    const stack = reason instanceof Error ? (reason.stack || '(no stack)') : '(no stack)';
    post({
      id: ++id, type: 'error', method: 'ERR',
      event: 'unhandledrejection', url: location.href,
      target: 'Promise',
      detail: { message: msg, reason: String(reason ?? '') },
      error: msg, stack,
      timestamp: Date.now(),
      statusCode: null, statusText: 'unhandled rejection', responseTime: null,
      requestHeaders: {}, requestBody: null,
      responseHeaders: {}, responseBody: null
    });
  });
})();
