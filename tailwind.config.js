/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#FFFFFF",
        ink: "#111111",
        acid: "#111111",
        line: "#ECECEC",
      },
      boxShadow: {
        card: "0 18px 50px rgba(17, 17, 17, 0.06)",
        lift: "0 26px 70px rgba(17, 17, 17, 0.11)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "PingFang SC",
          "Microsoft YaHei",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
