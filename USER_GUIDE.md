# 📖 TDM Web Dev Inspector & Multi-AI Suite — User Guide

Welcome to **TDM Web Dev Inspector**, an all-in-one state-of-the-art Chrome extension for web developers, API engineers, and security auditors.

---

## 📑 Table of Contents
1. [🚀 Quick Start & Installation](#1-quick-start--installation)
2. [💻 Native Chrome DevTools Integration (F12)](#2-native-chrome-devtools-integration-f12)
3. [🤖 Multi-AI Assistant Configuration (Gemini, Groq, OpenAI)](#3-multi-ai-assistant-configuration-gemini-groq-openai)
4. [🛡️ AI Network Security & OWASP Vulnerability Auditor](#4-ai-network-security--owasp-vulnerability-auditor)
5. [⚡ Header Rewriter Engine (ModHeader)](#5-header-rewriter-engine-modheader)
6. [🎭 Advanced Mock Interceptor & Latency Simulator](#6-advanced-mock-interceptor--latency-simulator)
7. [📊 Network Waterfall & Performance Studio](#7-network-waterfall--performance-studio)
8. [🌳 Collapsible Interactive JSON Tree Viewer](#8-collapsible-interactive-json-tree-viewer)
9. [💻 Multi-Language Code Snippet Generator](#9-multi-language-code-snippet-generator)
10. [🔀 Side-by-Side Request Diff Tool](#10-side-by-side-request-diff-tool)
11. [🧪 API Test Runner & K6 Load Test Exporter](#11-api-test-runner--k6-load-test-exporter)
12. [🍪 Storage, Cookie & LocalState Manager](#12-storage-cookie--localstate-manager)
13. [▶️ In-Tab Request Replay Console](#13-in-tab-request-replay-console)
14. [⌨️ Keyboard Shortcuts & Troubleshooting](#14-keyboard-shortcuts--troubleshooting)

---

## 1. 🚀 Quick Start & Installation

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer Mode** (toggle switch in the top right).
3. Click **Load unpacked** and select the extension folder:
   `d:\WORK ZONE\MY PROJ\WEB_EXTENSION_HUB\TDM_WEB_DEV_EXT_ADV\TDM_WEB_DEV_EXT_ADV`
4. Pin the extension icon to your browser toolbar.

---

## 2. 💻 Native Chrome DevTools Integration (F12)

You can use the inspector in two convenient ways:
1. **Standalone Inspector Window**: Click the extension icon in the toolbar.
2. **Native DevTools Panel**:
   - Press `F12` (or Right-Click -> Inspect).
   - Look for the **"TDM Inspector"** tab alongside Chrome's native `Network` and `Console` tabs.

---

## 3. 🤖 Multi-AI Assistant Configuration (Gemini, Groq, OpenAI)

The extension includes a unified AI engine supporting three top AI providers:

### Supported AI Models
- **Google Gemini**: `gemini-2.5-flash` (Recommended), `gemini-2.5-pro`, `gemini-1.5-flash`, `gemini-1.5-pro`
- **Groq AI**: `llama-3.3-70b-versatile` (Recommended), `llama-3.1-8b-instant`, `mixtral-8x7b-32768`, `deepseek-r1-distill-llama-70b`
- **OpenAI**: `gpt-4o-mini` (Recommended), `gpt-4o`, `gpt-4-turbo`, `o3-mini`

### How to Configure AI Keys
1. Open the floating Chat Widget or click the **AI Assistant** / **⚙️ Settings** button.
2. Select your preferred **AI Provider** (e.g., Google Gemini).
3. Enter your API Key into the corresponding input field.
4. Select your preferred **Active Model**.
5. Click **Save Settings**.

> 🔒 **Security Guarantee**: Your API keys are saved exclusively in Chrome Extension Secure Local Storage (`chrome.storage.local`). **Keys persist until manually deleted by you** and are completely hidden from webpage scripts and `localStorage`.

---

## 4. 🛡️ AI Network Security & OWASP Vulnerability Auditor

Run an automated security audit on your captured network traffic with a single click.

### How to Run a Security Audit
1. Interact with your web page to capture traffic (`fetch`, `XHR`).
2. Click the **🛡️ Security Audit** button in the header.
3. Click **Start Security Audit**.
4. The AI will scan captured requests, headers, and payload snippets for:
   - **Exposed Secrets & Tokens**: Hardcoded JWTs, API keys, database passwords.
   - **Missing Security Headers**: Missing `Content-Security-Policy`, `HSTS`, `X-Frame-Options`, or unsafe CORS wildcard origins.
   - **PII Data Leaks**: Unencrypted credit cards, emails, or personal identifiers.
   - **OWASP API Security Top 10 Risks**.

---

## 5. ⚡ Header Rewriter Engine (ModHeader)

Dynamically add, modify, or remove HTTP headers on live web requests matching specific pattern rules.

### Adding a Header Rule
1. Click the **⚡ Headers** button in the top action bar.
2. Select an Action: **Add / Set Header** or **Remove Header**.
3. Choose HTTP Method (`ALL`, `GET`, `POST`, etc.) and Match Type (`Contains`, `Exact`, `Regex`).
4. Enter the URL Pattern (e.g. `https://api.example.com/.*` or `/v1/`).
5. Enter **Header Name** (e.g. `Authorization` or `X-Custom-Env`) and **Header Value** (e.g. `Bearer token...`).
6. Click **Save Header Rule**. Matching outgoing requests will immediately include your modified header!

---

## 6. 🎭 Advanced Mock Interceptor & Latency Simulator

Intercept requests and return custom mocked status codes, headers, response bodies, and simulated delay without a mock server.

### Creating an Advanced Mock Rule
1. Click the **Mocks** button or the **⚡ Mock** action on any captured request.
2. Configure:
   - **HTTP Method**: Filter by `GET`, `POST`, `PUT`, `DELETE`, etc.
   - **Match Type**: Match via `Contains Substring`, `Exact Match`, or `Regex Pattern`.
   - **Status Code**: Custom HTTP status (e.g. `200`, `404`, `500`).
   - **Delay (ms)**: Artificial delay (e.g. `1500ms`) to test loading spinners.
   - **Custom Headers**: JSON string of custom response headers.
   - **Response Body**: Custom JSON or plain text mock response.
3. Click **Add Mock**.

---

## 7. 📊 Network Waterfall & Performance Studio

Analyze request timelines, bandwidth, and latency bottlenecks.

1. Select any captured request and click the **Waterfall** tab.
2. View summary metrics:
   - **Total Requests**
   - **Total Transferred MB**
   - **Average Latency (ms)**
   - **Error Rate %**
3. Inspect the Gantt chart timeline bars:
   - 🟢 **Green**: Fast (<100ms)
   - 🟡 **Yellow**: Medium (<500ms)
   - 🔴 **Red**: Slow (>500ms)

---

## 8. 🌳 Collapsible Interactive JSON Tree Viewer

Format raw JSON payloads into an interactive tree structure:
1. Click the **JSON Tree** tab on any captured request or response.
2. Click `▶` / `▼` toggle icons to expand/collapse object/array nodes.
3. **Copy Key Path**: Click on any key (e.g. `data.items[0].id`) to copy its exact JSON path to your clipboard.

---

## 9. 💻 Multi-Language Code Snippet Generator

Generate copy-ready code snippets for any captured endpoint in 6 popular languages:
- **JavaScript Fetch**: Browser native code.
- **cURL**: Ready-to-run shell command.
- **Python**: `requests` / `httpx` module snippet.
- **Node.js**: `axios` library snippet.
- **Go**: `net/http` standard library snippet.
- **Rust**: `reqwest` async snippet.

---

## 10. 🔀 Side-by-Side Request Diff Tool

Compare two captured requests side-by-side:
1. Click the **Diff** button in the header bar.
2. Select **Request A (Base)** and **Request B (Compare)** from the dropdown menus.
3. The diff viewer highlights added, removed, and matching headers, parameters, and bodies in green and red.

---

## 11. 🧪 API Test Runner & K6 Load Test Exporter

Execute automated assertions on captured traffic and export load testing scripts.

1. Click the **Runner** tab.
2. Click **▶ Run Test Suite** to test all captured endpoints against status assertions.
3. Click **⚡ Export as K6 Load Test Script** to download a ready-to-run `k6_script.js` for load testing with [K6.io](https://k6.io).

---

## 12. 🍪 Storage, Cookie & LocalState Manager

1. Click the **Storage** tab.
2. Click **🔄 Refresh Storage** to view all active cookies for the current domain.
3. Click **🗑️ Clear Domain Cookies** to quickly log out or test unauthenticated states.

---

## 13. ▶️ In-Tab Request Replay Console

Replay or edit captured requests directly inside your target tab's execution context:
1. Select a request and click **✎ Edit** or **▶ Recall**.
2. Check the box **"Replay inside Tab (Preserves page session & cookies)"**.
3. Modify method, URL, headers, or body, and click **Send**.
4. The request will execute inside the page `MAIN` world, ensuring authentic session cookies and origins are sent.

---

## 14. ⌨️ Keyboard Shortcuts & Troubleshooting

### Keyboard Shortcuts
- `Enter`: Send message in AI Assistant.
- `Escape`: Close active modal or sidebar.

### Troubleshooting & FAQ
- **Q: AI completions fail with an error.**
  * *Fix*: Click ⚙️ Settings in the AI widget and ensure an API key for your active provider (Gemini, Groq, or OpenAI) is entered and saved.
- **Q: Mock rules are not triggering.**
  * *Fix*: Ensure the rule is enabled (toggle switch ON) and the HTTP Method matches your request (`ALL` matches any method).
