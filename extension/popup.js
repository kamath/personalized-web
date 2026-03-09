// Generate URL pattern suggestions from a URL
function generatePatterns(url) {
  const patterns = [];
  try {
    const u = new URL(url);
    const pathParts = u.pathname.split("/").filter(Boolean);

    // Exact URL (without query/hash)
    patterns.push({
      label: "Exact URL",
      pattern: `${u.origin}${u.pathname}`,
    });

    // Progressive wildcards from deepest to shallowest
    for (let i = pathParts.length - 1; i >= 1; i--) {
      const base = pathParts.slice(0, i).join("/");
      patterns.push({
        label: `${u.host}/${base}/*`,
        pattern: `${u.origin}/${base}/*`,
      });
    }

    // Entire domain
    patterns.push({
      label: `${u.host}/*`,
      pattern: `${u.origin}/*`,
    });

    // Describe with prompt
    patterns.push({
      label: "Describe pages (AI generates regex)",
      pattern: "prompt",
    });

    // Custom regex
    patterns.push({
      label: "Custom regex",
      pattern: "custom",
    });
  } catch {
    patterns.push({ label: "Custom regex", pattern: "custom" });
  }
  return patterns;
}

// Render URL pattern radio buttons
function renderPatterns(patterns) {
  const container = document.getElementById("urlPatterns");
  container.innerHTML = "";
  patterns.forEach((p, i) => {
    const div = document.createElement("div");
    div.className = "url-pattern" + (i === 0 ? " selected" : "");
    div.innerHTML = `
      <input type="radio" name="urlPattern" value="${p.pattern}" ${i === 0 ? "checked" : ""}>
      <code>${p.label}</code>
    `;
    div.addEventListener("click", () => {
      document.querySelectorAll(".url-pattern").forEach((el) => el.classList.remove("selected"));
      div.classList.add("selected");
      div.querySelector("input").checked = true;
      const customInput = document.getElementById("customPattern");
      const promptInput = document.getElementById("promptPattern");
      if (p.pattern === "custom") {
        customInput.classList.add("visible");
        promptInput.classList.remove("visible");
        customInput.focus();
      } else if (p.pattern === "prompt") {
        promptInput.classList.add("visible");
        customInput.classList.remove("visible");
        promptInput.focus();
      } else {
        customInput.classList.remove("visible");
        promptInput.classList.remove("visible");
      }
    });
    container.appendChild(div);
  });
}

// Load and display saved rules
async function loadRules() {
  const { rules = [] } = await chrome.storage.local.get("rules");
  const container = document.getElementById("rulesList");
  if (rules.length === 0) {
    container.innerHTML = '<div class="empty-rules">No saved rules yet</div>';
    return;
  }
  container.innerHTML = "";
  rules.forEach((rule, i) => {
    const div = document.createElement("div");
    div.className = "rule-item";
    div.innerHTML = `
      <div class="rule-info">
        <div class="rule-pattern">${escapeHtml(rule.urlPattern)}</div>
        <div class="rule-prompt">${escapeHtml(rule.prompt)}</div>
      </div>
      <div class="rule-actions">
        <button data-index="${i}" class="delete-rule" title="Delete rule">&times;</button>
      </div>
    `;
    container.appendChild(div);
  });
  container.querySelectorAll(".delete-rule").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const idx = parseInt(e.target.dataset.index);
      const { rules = [] } = await chrome.storage.local.get("rules");
      rules.splice(idx, 1);
      await chrome.storage.local.set({ rules });
      loadRules();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function setStatus(msg, type = "") {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = "status " + type;
}

// Get selected pattern value
function getSelectedPattern() {
  const selected = document.querySelector('input[name="urlPattern"]:checked');
  if (!selected) return null;
  if (selected.value === "custom") {
    return document.getElementById("customPattern").value.trim();
  }
  if (selected.value === "prompt") {
    return "prompt"; // signal that we need to generate it
  }
  return selected.value;
}

// Generate a regex pattern from a natural language description
async function generatePatternFromPrompt(description, currentUrl) {
  const response = await fetch("http://localhost:3456/api/generate-pattern", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description, currentUrl }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(err || `Server error ${response.status}`);
  }
  const data = await response.json();
  return data.pattern;
}

// Initialize popup
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    document.getElementById("currentUrl").textContent = "No URL available";
    return;
  }

  document.getElementById("currentUrl").textContent = tab.url;
  const patterns = generatePatterns(tab.url);
  renderPatterns(patterns);
  loadRules();

  // Submit handler
  document.getElementById("submit").addEventListener("click", async () => {
    const prompt = document.getElementById("prompt").value.trim();
    let urlPattern = getSelectedPattern();

    if (!prompt) {
      setStatus("Please enter a prompt", "error");
      return;
    }
    if (!urlPattern) {
      setStatus("Please select or enter a URL pattern", "error");
      return;
    }
    if (urlPattern === "prompt") {
      const desc = document.getElementById("promptPattern").value.trim();
      if (!desc) {
        setStatus("Please describe which pages to match", "error");
        return;
      }
    }

    const submitBtn = document.getElementById("submit");
    submitBtn.disabled = true;

    // If "prompt" mode, generate the regex first
    if (urlPattern === "prompt") {
      const desc = document.getElementById("promptPattern").value.trim();
      setStatus("Generating URL pattern from description...", "loading");
      try {
        urlPattern = await generatePatternFromPrompt(desc, tab.url);
        setStatus(`Generated pattern: ${urlPattern}`, "loading");
      } catch (err) {
        setStatus(err.message, "error");
        submitBtn.disabled = false;
        return;
      }
    }

    setStatus("Sending to Claude via ACP...", "loading");

    try {
      // Get page content from content script
      const [{ result: pageContent }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.documentElement.outerHTML,
      });

      const response = await fetch("http://localhost:3456/api/modify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          urlPattern,
          currentUrl: tab.url,
          pageContent: pageContent.slice(0, 50000), // limit size
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(err || `Server error ${response.status}`);
      }

      const data = await response.json();

      // Apply the modification via content script
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (css, js) => {
          if (css) {
            const style = document.createElement("style");
            style.setAttribute("data-page-modifier", "true");
            style.textContent = css;
            document.head.appendChild(style);
          }
          if (js) {
            try { new Function(js)(); } catch (e) { console.error("Page Modifier JS error:", e); }
          }
        },
        args: [data.css || "", data.js || ""],
      });

      // Save the rule
      const { rules = [] } = await chrome.storage.local.get("rules");
      rules.push({
        urlPattern,
        prompt,
        css: data.css || "",
        js: data.js || "",
        createdAt: Date.now(),
      });
      await chrome.storage.local.set({ rules });

      setStatus("Applied successfully!", "success");
      loadRules();
    } catch (err) {
      setStatus(err.message, "error");
    } finally {
      submitBtn.disabled = false;
    }
  });
}

init();
