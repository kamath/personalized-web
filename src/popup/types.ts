export interface Rule {
  urlPattern: string;
  prompt: string;
  css: string;
  js: string;
  createdAt: number;
}

export interface SliderStop {
  label: string;
  pattern: string;
}

export type PatternMode = "slider" | "custom" | "prompt";

export type StatusType = "" | "error" | "success" | "loading";
