/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/popup/**/*.{js,jsx,ts,tsx,html}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#111113",
        surface: "#1c1c20",
        "surface-hover": "#232328",
        border: "#2e2e35",
        "border-focus": "#e8925a",
        text: "#ededef",
        "text-secondary": "#b4b4bc",
        "text-tertiary": "#8a8a96",
        accent: "#e8925a",
        "accent-hover": "#f0a574",
        danger: "#f0736a",
        success: "#5ccf8d",
        warning: "#eab354",
      },
      borderRadius: {
        DEFAULT: "8px",
        sm: "6px",
      },
      fontFamily: {
        sans: ["DM Sans", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["JetBrains Mono", "SF Mono", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
