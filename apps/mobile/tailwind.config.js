/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        canvas: "#f3f5f2",
        ink: "#183229",
        field: {
          50: "#f5f8f6",
          100: "#e8f0eb",
          600: "#285d45",
          800: "#173e2d",
        },
        mineral: "#66766e",
        line: "#dce4df",
        amber: "#f3a712",
        danger: "#a9262b",
      },
      borderRadius: {
        field: "12px",
      },
    },
  },
  plugins: [],
};
