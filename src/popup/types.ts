export type PatternMode = "slider" | "custom" | "prompt";

export interface SliderStop {
  label: string;
  pattern: string;
}

export interface Rule {
  urlPattern: string;
  prompt: string;
  css?: string;
  js?: string;
  createdAt: number;
}

export interface StatusMessage {
  msg: string;
  type: "error" | "success" | "loading" | "";
}
