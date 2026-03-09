import React, { useCallback, useEffect, useState } from "react";
import type { PatternMode, Rule, StatusType } from "./types";
import {
  checkServerHealth,
  generatePatternFromPrompt,
  generateSliderStops,
  requestModification,
} from "./utils";
import UrlPatternField from "./components/UrlPatternField";
import SavedRules from "./components/SavedRules";

export default function App() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [currentUrl, setCurrentUrl] = useState("Loading...");
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null);

  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<PatternMode>("slider");
  const [customPattern, setCustomPattern] = useState("");
  const [promptPattern, setPromptPattern] = useState("");

  const [sliderStops, setSliderStops] = useState([
    { label: "/", pattern: "/" },
  ]);
  const [sliderValue, setSliderValue] = useState(0);

  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState<StatusType>("");
  const [submitting, setSubmitting] = useState(false);

  const [rules, setRules] = useState<Rule[]>([]);

  // Load rules from Chrome storage
  const loadRules = useCallback(async () => {
    const { rules = [] } = await chrome.storage.local.get("rules");
    setRules(rules);
  }, []);

  // Init: health check, get tab, load rules
  useEffect(() => {
    (async () => {
      const healthy = await checkServerHealth();
      setOnline(healthy);
      if (!healthy) return;

      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!activeTab?.url) {
        setCurrentUrl("No URL available");
        return;
      }

      setTab(activeTab);
      setCurrentUrl(activeTab.url);

      const stops = generateSliderStops(activeTab.url);
      setSliderStops(stops);
      setSliderValue(stops.length - 1);

      await loadRules();
    })();
  }, [loadRules]);

  const showStatus = (msg: string, type: StatusType = "") => {
    setStatus(msg);
    setStatusType(type);
  };

  const getSelectedPattern = (): string | null => {
    if (mode === "custom") return customPattern.trim() || null;
    if (mode === "prompt") return "prompt";
    return sliderStops[sliderValue]?.pattern ?? null;
  };

  const handleSubmit = async () => {
    const promptText = prompt.trim();
    let urlPattern = getSelectedPattern();

    if (!promptText) {
      showStatus("Please enter a prompt", "error");
      return;
    }
    if (!urlPattern) {
      showStatus("Please select or enter a URL pattern", "error");
      return;
    }
    if (urlPattern === "prompt" && !promptPattern.trim()) {
      showStatus("Please describe which pages to match", "error");
      return;
    }
    if (!tab) return;

    setSubmitting(true);

    // If "prompt" mode, generate the regex first
    if (urlPattern === "prompt") {
      showStatus("Generating URL pattern from description...", "loading");
      try {
        urlPattern = await generatePatternFromPrompt(
          promptPattern.trim(),
          tab.url!
        );
        showStatus(`Generated pattern: ${urlPattern}`, "loading");
      } catch (err: any) {
        showStatus(err.message, "error");
        setSubmitting(false);
        return;
      }
    }

    showStatus("Sending to Claude via ACP...", "loading");

    try {
      const [{ result: pageContent }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: () => document.documentElement.outerHTML,
      });

      const data = await requestModification({
        prompt: promptText,
        urlPattern,
        currentUrl: tab.url!,
        pageContent: (pageContent as string).slice(0, 50000),
      });

      // Apply the modification via content script
      await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: (css: string, js: string) => {
          if (css) {
            const style = document.createElement("style");
            style.setAttribute("data-page-modifier", "true");
            style.textContent = css;
            document.head.appendChild(style);
          }
          if (js) {
            try {
              new Function(js)();
            } catch (e) {
              console.error("Page Modifier JS error:", e);
            }
          }
        },
        args: [data.css || "", data.js || ""],
      });

      // Save the rule
      const { rules: existing = [] } =
        await chrome.storage.local.get("rules");
      existing.push({
        urlPattern,
        prompt: promptText,
        css: data.css || "",
        js: data.js || "",
        createdAt: Date.now(),
      });
      await chrome.storage.local.set({ rules: existing });

      showStatus("Applied successfully!", "success");
      await loadRules();
    } catch (err: any) {
      showStatus(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRule = async (index: number) => {
    const { rules: existing = [] } = await chrome.storage.local.get("rules");
    existing.splice(index, 1);
    await chrome.storage.local.set({ rules: existing });
    await loadRules();
  };

  // Loading state
  if (online === null) return null;

  // Offline
  if (!online) {
    return (
      <div className="container">
        <h1>Page Modifier</h1>
        <div className="offline-msg">
          Server is not running. Start the server and reopen the extension.
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>Page Modifier</h1>

      <div className="url-current">{currentUrl}</div>

      <div className="field">
        <label>Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Make the background dark, increase font size, hide the sidebar..."
        />
      </div>

      <UrlPatternField
        stops={sliderStops}
        mode={mode}
        onModeChange={setMode}
        customPattern={customPattern}
        onCustomPatternChange={setCustomPattern}
        promptPattern={promptPattern}
        onPromptPatternChange={setPromptPattern}
        sliderValue={sliderValue}
        onSliderChange={setSliderValue}
      />

      <button
        className="primary"
        disabled={submitting}
        onClick={handleSubmit}
      >
        Apply Modification
      </button>

      {status && (
        <div className={`status ${statusType}`}>{status}</div>
      )}

      <SavedRules rules={rules} onDelete={handleDeleteRule} />
    </div>
  );
}
