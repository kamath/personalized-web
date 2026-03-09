// Create context menu item for selected text
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "hello-alert",
    title: 'Say Hello',
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "hello-alert") {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => alert("hello"),
    });
  }
});

// Background service worker: re-applies rules when tabs navigate
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;

  // Skip chrome:// and extension pages
  if (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) return;

  const { rules = [] } = await chrome.storage.local.get("rules");
  const url = tab.url;

  const matchingRules = rules.filter((rule) => {
    try {
      const regexStr = "^" + rule.urlPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$";
      return new RegExp(regexStr).test(url);
    } catch {
      return false;
    }
  });

  for (const rule of matchingRules) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (css, js, ruleId) => {
          if (css) {
            const existing = document.querySelector(`style[data-page-modifier-rule="${ruleId}"]`);
            if (!existing) {
              const style = document.createElement("style");
              style.setAttribute("data-page-modifier", "true");
              style.setAttribute("data-page-modifier-rule", String(ruleId));
              style.textContent = css;
              document.head.appendChild(style);
            }
          }
          if (js) {
            try { new Function(js)(); } catch (e) { console.error("Page Modifier JS error:", e); }
          }
        },
        args: [rule.css || "", rule.js || "", rule.createdAt],
      });
    } catch {
      // Tab may not be scriptable (e.g., chrome:// pages)
    }
  }
});
