// Generate slider stops from a URL (from broadest to most specific)
function generateSliderStops(url) {
  const stops = [];
  try {
    const u = new URL(url);
    const pathParts = u.pathname.split("/").filter(Boolean);

    // Broadest: entire domain
    stops.push({
      label: `${u.host}/*`,
      pattern: `${u.origin}/*`,
    });

    // Progressive paths from shallowest to deepest
    for (let i = 1; i < pathParts.length; i++) {
      const base = pathParts.slice(0, i).join("/");
      stops.push({
        label: `${u.host}/${base}/*`,
        pattern: `${u.origin}/${base}/*`,
      });
    }

    // Most specific: exact URL
    stops.push({
      label: "Exact URL",
      pattern: `${u.origin}${u.pathname}`,
    });
  } catch {
    stops.push({ label: url, pattern: url });
  }
  return stops;
}

// Current state
let sliderStops = [];
let selectedMode = "slider"; // "slider" | "custom" | "prompt"

// Render slider with stops
function renderSlider(stops) {
  sliderStops = stops;
  const slider = document.getElementById("urlSlider");
  const preview = document.getElementById("sliderPreview");

  slider.min = 0;
  slider.max = stops.length - 1;
  slider.value = stops.length - 1; // default to exact URL
  slider.step = 1;

  preview.textContent = stops[stops.length - 1].pattern;

  slider.addEventListener("input", () => {
    preview.textContent = stops[slider.value].pattern;
    // When slider is used, ensure slider mode is active
    if (selectedMode !== "slider") {
      selectMode("slider");
    }
  });
}

function selectMode(mode) {
  selectedMode = mode;
  const sliderContainer = document.getElementById("sliderContainer");
  const optPrompt = document.getElementById("optPrompt");
  const optCustom = document.getElementById("optCustom");
  const customInput = document.getElementById("customPattern");
  const promptInput = document.getElementById("promptPattern");

  sliderContainer.classList.toggle("inactive", mode !== "slider");
  optPrompt.classList.toggle("selected", mode === "prompt");
  optCustom.classList.toggle("selected", mode === "custom");

  customInput.classList.toggle("visible", mode === "custom");
  promptInput.classList.toggle("visible", mode === "prompt");

  if (mode === "custom") customInput.focus();
  if (mode === "prompt") promptInput.focus();
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
  if (selectedMode === "custom") {
    return document.getElementById("customPattern").value.trim();
  }
  if (selectedMode === "prompt") {
    return "prompt";
  }
  // Slider mode
  const slider = document.getElementById("urlSlider");
  return sliderStops[slider.value]?.pattern || null;
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
  // Healthcheck — hide form if server is down
  try {
    const res = await fetch("http://localhost:3456/health", { signal: AbortSignal.timeout(2000) });
    if (!res.ok) throw new Error();
  } catch {
    document.getElementById("mainForm").style.display = "none";
    document.getElementById("offlineView").style.display = "block";
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    document.getElementById("currentUrl").textContent = "No URL available";
    return;
  }

  document.getElementById("currentUrl").textContent = tab.url;
  const stops = generateSliderStops(tab.url);
  renderSlider(stops);
  loadRules();

  // Alt option click handlers
  document.getElementById("optPrompt").addEventListener("click", () => {
    selectMode(selectedMode === "prompt" ? "slider" : "prompt");
  });
  document.getElementById("optCustom").addEventListener("click", () => {
    selectMode(selectedMode === "custom" ? "slider" : "custom");
  });
  document.getElementById("sliderContainer").addEventListener("click", () => {
    if (selectedMode !== "slider") selectMode("slider");
  });

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
