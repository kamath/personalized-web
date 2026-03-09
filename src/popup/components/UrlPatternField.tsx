import React, { useEffect, useRef, useState } from "react";
import type { PatternMode, SliderStop } from "../types";

interface Props {
  stops: SliderStop[];
  mode: PatternMode;
  onModeChange: (mode: PatternMode) => void;
  customPattern: string;
  onCustomPatternChange: (value: string) => void;
  promptPattern: string;
  onPromptPatternChange: (value: string) => void;
  sliderValue: number;
  onSliderChange: (value: number) => void;
}

export default function UrlPatternField({
  stops,
  mode,
  onModeChange,
  customPattern,
  onCustomPatternChange,
  promptPattern,
  onPromptPatternChange,
  sliderValue,
  onSliderChange,
}: Props) {
  const customRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "custom") customRef.current?.focus();
    if (mode === "prompt") promptRef.current?.focus();
  }, [mode]);

  const toggleMode = (target: PatternMode) => {
    onModeChange(mode === target ? "slider" : target);
  };

  return (
    <div className="field">
      <label>URL Pattern</label>
      <div
        className={`url-slider-container${mode !== "slider" ? " inactive" : ""}`}
        onClick={() => mode !== "slider" && onModeChange("slider")}
      >
        <div className="url-slider-labels">
          <span>/</span>
          <span>exact url</span>
        </div>
        <input
          type="range"
          min={0}
          max={stops.length - 1}
          value={sliderValue}
          step={1}
          onChange={(e) => {
            onSliderChange(Number(e.target.value));
            if (mode !== "slider") onModeChange("slider");
          }}
        />
        <div className="url-slider-preview">
          {stops[sliderValue]?.pattern ?? ""}
        </div>
      </div>

      <div className="url-alt-options">
        <div
          className={`url-alt-option${mode === "prompt" ? " selected" : ""}`}
          onClick={() => toggleMode("prompt")}
        >
          Describe matching pages
        </div>
        <div
          className={`url-alt-option${mode === "custom" ? " selected" : ""}`}
          onClick={() => toggleMode("custom")}
        >
          Enter pattern manually
        </div>
      </div>

      {mode === "custom" && (
        <input
          ref={customRef}
          type="text"
          className="custom-pattern-input"
          placeholder="Custom regex, e.g. https://x\.com/.*"
          value={customPattern}
          onChange={(e) => onCustomPatternChange(e.target.value)}
        />
      )}

      {mode === "prompt" && (
        <input
          ref={promptRef}
          type="text"
          className="custom-pattern-input"
          placeholder="e.g. GitHub repo pages, YouTube video pages..."
          value={promptPattern}
          onChange={(e) => onPromptPatternChange(e.target.value)}
        />
      )}
    </div>
  );
}
