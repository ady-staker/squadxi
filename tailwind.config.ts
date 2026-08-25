import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
      colors: {
        // "Stadium under lights" theme -- deliberately distinct from all 5
        // sibling apps (PRIDE SUPPLY's dark ink, Vantage Peptides' clinical
        // light, Flipside's dark gold/casino, Meridian Dental's warm
        // cream/coral, ElfSwap's space-violet DeFi glass). Values now live
        // as CSS custom properties in globals.css (light/dark/system), read
        // here via rgb(var(--x) / <alpha-value>) so opacity utilities keep
        // working. `gold`/`caution`/`loss`/`win` stay reserved specifically
        // for money/prize/warning contexts -- untouched by the toggle's
        // brand-color repaint so cash amounts still read distinctly from
        // normal UI actions anywhere in the app.
        paper: "rgb(var(--color-paper) / <alpha-value>)",
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        // primary: the repaint's new brand/CTA color (indigo)
        primary: "rgb(var(--color-primary) / <alpha-value>)",
        "primary-dark": "rgb(var(--color-primary-dark) / <alpha-value>)",
        // accent/secondary: pitch green, narrowed to live/positive/hover
        // highlights -- same value, two names for readability at call sites
        accent: "rgb(var(--color-secondary) / <alpha-value>)",
        "accent-dark": "rgb(var(--color-secondary-dark) / <alpha-value>)",
        secondary: "rgb(var(--color-secondary) / <alpha-value>)",
        "secondary-dark": "rgb(var(--color-secondary-dark) / <alpha-value>)",
        // tertiary: new magenta accent for offers/marquee/energy moments
        tertiary: "rgb(var(--color-tertiary) / <alpha-value>)",
        gold: "rgb(var(--color-gold) / <alpha-value>)",
        caution: "rgb(var(--color-caution) / <alpha-value>)",
        win: "rgb(var(--color-secondary) / <alpha-value>)",
        loss: "rgb(var(--color-loss) / <alpha-value>)",
        // chart-a/b: validated categorical pair (dataviz skill's slots 1/2)
        // for the two-team comparison chart -- brand primary/tertiary failed
        // the skill's CVD lightness-band check on our dark surface, so this
        // pair is chart-only, not reused as a UI accent.
        "chart-a": "rgb(var(--color-chart-a) / <alpha-value>)",
        "chart-b": "rgb(var(--color-chart-b) / <alpha-value>)",
      },
      keyframes: {
        "floodlight-drift": {
          "0%, 100%": { transform: "translate(-4%, -3%) scale(1)" },
          "50%": { transform: "translate(3%, 2%) scale(1.08)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.4", transform: "scale(0.75)" },
        },
        "rise-in": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "floodlight-drift": "floodlight-drift 14s ease-in-out infinite",
        "pulse-dot": "pulse-dot 1.6s ease-in-out infinite",
        "rise-in": "rise-in 0.6s ease-out both",
        marquee: "marquee 28s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
