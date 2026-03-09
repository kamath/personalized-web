import React from "react";
import type { SliderStop, PatternMode } from "../types";

interface UrlPatternFieldProps {
  mode: PatternMode;
  sliderStops: SliderStop[];
  sliderValue: number;
  customPattern: string;
  promptPattern: string;
  onModeChange: (mode: PatternMode) => void;
  onSliderChange: (value: number) => void;
  onCustomPatternChange: (value: string) => void;
  onPromptPatternChange: (value: string) => void;
}

export function UrlPatternField({
  mode,
  sliderStops,
  sliderValue,
  customPattern,
  promptPattern,
  onModeChange,
  onSliderChange,
  onCustomPatternChange,
  onPromptPatternChange,
}: UrlPatternFieldProps) {
  const handleSliderContainerClick = () => {
    if (mode !== "slider") {
      onModeChange("slider");
    }
  };

  const handlePromptClick = () => {
    onModeChange(mode === "prompt" ? "slider" : "prompt");
  };

  const handleCustomClick = () => {
    onModeChange(mode === "custom" ? "slider" : "custom");
  };

  const currentStop = sliderStops[sliderValue];

  return (
    <div className="field">
      <label>URL Pattern</label>
      <div
        className={`url-slider-container ${mode !== "slider" ? "inactive" : ""}`}
        onClick={handleSliderContainerClick}
      >
        <div className="url-slider-labels">
          <span>/</span>
          <span>exact url</span>
        </div>
        <input
          type="range"
          min="0"
          max={sliderStops.length - 1}
          value={sliderValue}
          step="1"
          onChange={(e) => {
            onSliderChange(Number(e.target.value));
            if (mode !== "slider") {
              onModeChange("slider");
            }
          }}
        />
        <div className="url-slider-preview">{currentStop?.pattern}</div>
      </div>
      <div className="url-alt-options">
        <div
          className={`url-alt-option ${mode === "prompt" ? "selected" : ""}`}
          onClick={handlePromptClick}
        >
          Describe matching pages
        </div>
        <div
          className={`url-alt-option ${mode === "custom" ? "selected" : ""}`}
          onClick={handleCustomClick}
        >
          Enter pattern manually
        </div>
      </div>
      <input
        type="text"
        className={`custom-pattern ${mode === "custom" ? "visible" : ""}`}
        placeholder="Custom regex, e.g. https://x\\.com/.*"
        value={customPattern}
        onChange={(e) => onCustomPatternChange(e.target.value)}
        autoFocus={mode === "custom"}
      />
      <input
        type="text"
        className={`custom-pattern ${mode === "prompt" ? "visible" : ""}`}
        placeholder="e.g. GitHub repo pages, YouTube video pages..."
        value={promptPattern}
        onChange={(e) => onPromptPatternChange(e.target.value)}
        autoFocus={mode === "prompt"}
      />
    </div>
  );
}
