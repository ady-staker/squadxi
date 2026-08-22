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
        // cream/coral, ElfSwap's space-violet DeFi glass). Reuses the same
        // token names (ink/surface/border/muted/accent/accent-dark/caution)
        // as the family convention so copied component JSX keeps working,
        // but with cricket-native values: deep floodlit-night navy, pitch
        // green as the primary action color, and a separate amber/gold
        // token reserved specifically for money/prize contexts (entry fees,
        // prize pools, payouts) so cash amounts read distinctly from normal
        // UI actions anywhere in the app.
        paper: "#0B1220", // page background -- night stadium navy
        ink: "#F3F6F4", // primary text / headings
        surface: "#131C2E", // card / panel background
        border: "#243044", // hairline borders
        muted: "#8695AC", // secondary text
        accent: "#4ADE80", // pitch green -- primary buttons, links, live indicators
        "accent-dark": "#22B966", // hover state for accent
        gold: "#F5B93F", // prize pool / money amounts / captain badge
        caution: "#F0894B", // warnings, disclaimers
        win: "#4ADE80",
        loss: "#E15A5A",
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
