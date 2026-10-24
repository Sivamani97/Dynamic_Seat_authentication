import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        surface: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          800: "#1e293b",
          900: "#0f172a",
          950: "#020617",
        },
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
        },
      },
      animation: {
        "pulse-fast": "pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "blink-alert": "blinkAlert 1s infinite",
        "beacon": "beacon 1.5s cubic-bezier(0, 0, 0.2, 1) infinite",
      },
      keyframes: {
        blinkAlert: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.4", transform: "scale(0.96)" },
        },
        beacon: {
          "0%": { transform: "scale(0.95)", boxShadow: "0 0 0 0 rgba(239, 68, 68, 0.7)" },
          "70%": { transform: "scale(1)", boxShadow: "0 0 0 14px rgba(239, 68, 68, 0)" },
          "100%": { transform: "scale(0.95)", boxShadow: "0 0 0 0 rgba(239, 68, 68, 0)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
