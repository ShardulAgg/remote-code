const path = require("path");

const hubDir = path.resolve(__dirname);

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    path.join(hubDir, "app/**/*.{js,ts,jsx,tsx,mdx}"),
    path.join(hubDir, "components/**/*.{js,ts,jsx,tsx,mdx}"),
    path.join(hubDir, "hooks/**/*.{js,ts,jsx,tsx}"),
    path.join(hubDir, "lib/**/*.{js,ts,jsx,tsx}"),
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0d1117",
          light: "#161b22",
          lighter: "#21262d",
        },
        border: {
          DEFAULT: "rgba(255,255,255,0.1)",
          light: "rgba(255,255,255,0.15)",
        },
        accent: {
          DEFAULT: "#58a6ff",
          dim: "rgba(88,166,255,0.15)",
        },
        success: { DEFAULT: "#3fb950" },
        danger: { DEFAULT: "#f85149" },
        warning: { DEFAULT: "#d29922" },
      },
    },
  },
  plugins: [],
};
