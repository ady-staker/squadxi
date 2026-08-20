import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
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
    },
  },
  plugins: [],
};

export default config;
