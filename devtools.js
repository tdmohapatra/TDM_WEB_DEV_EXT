/* DevTools Panel Registration */
chrome.devtools.panels.create(
  "TDM Inspector",
  "anime_icon.ico",
  "popup.html?tabId=" + chrome.devtools.inspectedWindow.tabId,
  function (panel) {
    // Panel created successfully
  }
);
