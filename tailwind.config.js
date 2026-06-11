/** @type {import('tailwindcss').Config} */
export default {
  // Preflight is intentionally disabled (no @tailwind base below) so Tailwind
  // layers cleanly over the hand-authored design system in public/app.css.
  content: ["./public/index.html"],
  theme: {
    extend: {
      colors: {
        ink: "#060607",
        surface: "#141417",
        line: "rgba(255,255,255,0.08)",
        muted: "#9a9aa2",
        faint: "#66666e",
      },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
