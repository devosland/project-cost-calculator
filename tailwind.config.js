/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './app/**/*.{js,jsx}',
    './src/**/*.{js,jsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      // ── Prism Design System — Warm direction ──────────────────────────────
      colors: {
        // shadcn-compatible tokens (preserved for backward compat)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },

        // Prism brand palette — Warm direction
        brand: {
          // Backgrounds / surfaces
          bg:          "#FDFAF5", // main canvas (light)
          "bg-elevated": "#FFFFFF", // cards, modals
          "bg-subtle":  "#F5F0E8", // nested surfaces, hover

          // Borders
          border:      "#E8DFD0",
          "border-strong": "#D4C5A8",

          // Text
          text:        "#1A1815",
          "text-secondary": "#5C554A",
          "text-tertiary":  "#8B8274",

          // Dark mode equivalents (usable as static values in dark: classes)
          "dark-bg":         "#1A1815",
          "dark-bg-elevated": "#24211D",
          "dark-bg-subtle":  "#2F2B26",
          "dark-border":     "#3A3530",
          "dark-border-strong": "#504940",
          "dark-text":       "#FAF7F0",
          "dark-text-secondary": "#B8AF9E",

          // Primary — amber
          amber:       "#F59E0B",
          "amber-dark": "#FBBF24",

          // Secondary — sage
          sage:        "#84A98C",
          "sage-dark": "#A8C6B0",

          // Semantic
          success:     "#16A34A",
          "success-dark": "#22C55E",
          warning:     "#F59E0B",
          "warning-dark": "#FBBF24",
          error:       "#DC2626",
          "error-dark": "#EF4444",
          info:        "#2563EB",
          "info-dark": "#3B82F6",
        },
      },

      // ── Typography ────────────────────────────────────────────────────────
      fontFamily: {
        sans:    ["DM Sans Variable", "system-ui", "-apple-system", "sans-serif"],
        display: ["Fraunces Variable", "Georgia", "serif"],
        mono:    ["JetBrains Mono Variable", "ui-monospace", "Consolas", "monospace"],
      },

      fontSize: {
        "display-2xl": ["48px", { lineHeight: "1.1",  letterSpacing: "-0.02em" }],
        "display-xl":  ["40px", { lineHeight: "1.15", letterSpacing: "-0.02em" }],
        "display-lg":  ["32px", { lineHeight: "1.2",  letterSpacing: "-0.015em" }],
        "heading-lg":  ["24px", { lineHeight: "1.3",  letterSpacing: "-0.01em", fontWeight: "700" }],
        "heading-md":  ["20px", { lineHeight: "1.35", letterSpacing: "-0.01em", fontWeight: "600" }],
        "heading-sm":  ["16px", { lineHeight: "1.4",  letterSpacing: "0em",     fontWeight: "600" }],
        "body-lg":     ["16px", { lineHeight: "1.6",  letterSpacing: "0em" }],
        "body-md":     ["14px", { lineHeight: "1.55", letterSpacing: "0em" }],
        "body-sm":     ["13px", { lineHeight: "1.5",  letterSpacing: "0em" }],
        "caption":     ["12px", { lineHeight: "1.5",  letterSpacing: "0.01em" }],
        "mono":        ["13px", { lineHeight: "1.5",  letterSpacing: "0em" }],
      },

      // ── Radii ─────────────────────────────────────────────────────────────
      borderRadius: {
        sm:   "6px",
        md:   "10px",
        lg:   "14px",
        xl:   "20px",
        full: "9999px",
        // preserve shadcn default radius token
        DEFAULT: "var(--radius)",
      },

      // ── Shadows (soft — Warm avoids dramatic shadows) ─────────────────────
      boxShadow: {
        sm:  "0 1px 2px 0 rgba(26, 24, 21, 0.06)",
        md:  "0 2px 8px 0 rgba(26, 24, 21, 0.08), 0 1px 2px 0 rgba(26, 24, 21, 0.04)",
        lg:  "0 8px 24px 0 rgba(26, 24, 21, 0.10), 0 2px 4px 0 rgba(26, 24, 21, 0.04)",
      },

      // ── Motion ────────────────────────────────────────────────────────────
      transitionDuration: {
        fast:   "120ms",
        normal: "200ms",
        slow:   "320ms",
      },
      transitionTimingFunction: {
        "ease-out-prism":    "cubic-bezier(0, 0, 0.2, 1)",
        "ease-in-out-prism": "cubic-bezier(0.4, 0, 0.2, 1)",
      },

      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}