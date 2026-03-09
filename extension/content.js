// Content script: applies saved rules on matching pages
(async function () {
  const url = window.location.href;
  const { rules = [] } = await chrome.storage.local.get("rules");

  for (const rule of rules) {
    if (matchesPattern(rule.urlPattern, url)) {
      applyRule(rule);
    }
  }

  function matchesPattern(pattern, url) {
    // Simple wildcard matching: convert * to regex .*
    // If pattern looks like a regex (contains special chars beyond *), use it directly
    try {
      // Convert glob-style pattern to regex
      const regexStr = "^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$";
      return new RegExp(regexStr).test(url);
    } catch {
      return false;
    }
  }

  function applyRule(rule) {
    if (rule.css) {
      const existing = document.querySelector(`style[data-page-modifier-rule="${rule.createdAt}"]`);
      if (existing) return; // already applied

      const style = document.createElement("style");
      style.setAttribute("data-page-modifier", "true");
      style.setAttribute("data-page-modifier-rule", String(rule.createdAt));
      style.textContent = rule.css;
      document.head.appendChild(style);
    }
    if (rule.js) {
      try {
        new Function(rule.js)();
      } catch (e) {
        console.error("Page Modifier JS error:", e);
      }
    }
  }
})();
