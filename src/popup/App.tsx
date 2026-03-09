import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { UrlPatternField } from "./components/UrlPatternField";
import { SavedRules } from "./components/SavedRules";
import {
  generateSliderStops,
  checkServerHealth,
  getCurrentTab,
  getPageContent,
  applyModification,
  saveRule,
  getRules,
  deleteRule,
  modifyPageViaServer,
  generatePatternFromPrompt,
} from "./utils";
import type { PatternMode, SliderStop, Rule, StatusMessage } from "./types";
import "./popup.css";

export default function App() {
  const [currentUrl, setCurrentUrl] = useState("Loading...");
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<PatternMode>("slider");
  const [sliderStops, setSliderStops] = useState<SliderStop[]>([]);
  const [sliderValue, setSliderValue] = useState(0);
  const [customPattern, setCustomPattern] = useState("");
  const [promptPattern, setPromptPattern] = useState("");
  const [status, setStatus] = useState<StatusMessage>({
    msg: "",
    type: "",
  });
  const [rules, setRules] = useState<Rule[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);

  // Poll server health every 3 seconds
  const { data: isServerHealthy = false } = useQuery({
    queryKey: ["serverHealth"],
    queryFn: checkServerHealth,
    refetchInterval: 3000,
  });

  // Initialize tab & rules when server becomes healthy
  useEffect(() => {
    if (!isServerHealthy) return;

    const init = async () => {
      // Get current tab
      const tab = await getCurrentTab();
      if (!tab?.url) {
        setCurrentUrl("No URL available");
        return;
      }

      setCurrentTab(tab);
      setCurrentUrl(tab.url);

      // Generate slider stops
      const stops = generateSliderStops(tab.url);
      setSliderStops(stops);
      setSliderValue(stops.length - 1); // default to exact URL

      // Load saved rules
      const savedRules = await getRules();
      setRules(savedRules);
    };

    init();
  }, [isServerHealthy]);

  const getSelectedPattern = (): string | null => {
    if (mode === "custom") {
      return customPattern.trim() || null;
    }
    if (mode === "prompt") {
      return "prompt";
    }
    // Slider mode
    return sliderStops[sliderValue]?.pattern || null;
  };

  const handleSubmit = async () => {
    const promptValue = prompt.trim();
    let urlPattern = getSelectedPattern();

    if (!promptValue) {
      setStatus({ msg: "Please enter a prompt", type: "error" });
      return;
    }
    if (!urlPattern) {
      setStatus({ msg: "Please select or enter a URL pattern", type: "error" });
      return;
    }
    if (urlPattern === "prompt") {
      const desc = promptPattern.trim();
      if (!desc) {
        setStatus({ msg: "Please describe which pages to match", type: "error" });
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // If "prompt" mode, generate the regex first
      if (urlPattern === "prompt") {
        const desc = promptPattern.trim();
        setStatus({ msg: "Generating URL pattern from description...", type: "loading" });
        try {
          urlPattern = await generatePatternFromPrompt(desc, currentUrl);
          setStatus({ msg: `Generated pattern: ${urlPattern}`, type: "loading" });
        } catch (err) {
          setStatus({ msg: err instanceof Error ? err.message : String(err), type: "error" });
          return;
        }
      }

      setStatus({ msg: "Sending to Claude via ACP...", type: "loading" });

      if (!currentTab) {
        setStatus({ msg: "No active tab found", type: "error" });
        return;
      }

      // Get page content
      const pageContent = await getPageContent(currentTab.id!);

      // Modify via server
      const result = await modifyPageViaServer(
        promptValue,
        urlPattern,
        currentUrl,
        pageContent
      );

      // Apply the modification
      await applyModification(currentTab.id!, result.css || "", result.js || "");

      // Save the rule
      await saveRule({
        urlPattern,
        prompt: promptValue,
        css: result.css || "",
        js: result.js || "",
      });

      setStatus({ msg: "Applied successfully!", type: "success" });

      // Refresh rules
      const updatedRules = await getRules();
      setRules(updatedRules);

      // Clear form
      setPrompt("");
      setCustomPattern("");
      setPromptPattern("");
      setMode("slider");
      setSliderValue(sliderStops.length - 1);
    } catch (err) {
      setStatus({ msg: err instanceof Error ? err.message : String(err), type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRule = async (index: number) => {
    await deleteRule(index);
    const updatedRules = await getRules();
    setRules(updatedRules);
  };

  if (!isServerHealthy) {
    return (
      <div className="container">
        <h1>Page Modifier</h1>
        <div className="offline-msg">
          Server is not running. Start the server and this will connect automatically.
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
        mode={mode}
        sliderStops={sliderStops}
        sliderValue={sliderValue}
        customPattern={customPattern}
        promptPattern={promptPattern}
        onModeChange={setMode}
        onSliderChange={setSliderValue}
        onCustomPatternChange={setCustomPattern}
        onPromptPatternChange={setPromptPattern}
      />

      <button
        className="primary"
        onClick={handleSubmit}
        disabled={isSubmitting}
      >
        Apply Modification
      </button>
      <div className={`status ${status.type}`}>{status.msg}</div>

      <SavedRules rules={rules} onDeleteRule={handleDeleteRule} />
    </div>
  );
}
