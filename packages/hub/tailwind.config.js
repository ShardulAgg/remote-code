/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
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
        accent: "#58a6ff",
        success: "#3fb950",
        danger: "#f85149",
        warning: "#d29922",
      },
    },
  },
  plugins: [],
};
