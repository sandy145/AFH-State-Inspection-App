import type { Config } from "tailwindcss";

/**
 * Palette note: this is an operational government application, not a marketing
 * site. It follows the Washington State DSHS / ALTSA visual language — a navy
 * agency band, an ochre administration band, square corners and thin rules —
 * and every status colour is paired with an icon and a text label in the UI so
 * colour is never the only channel (WCAG 2.1 AA, 1.4.1).
 */
const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1.5rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        banner: {
          DEFAULT: "hsl(var(--banner))",
          foreground: "hsl(var(--banner-foreground))",
          mark: "hsl(var(--banner-mark))",
        },
        administration: {
          DEFAULT: "hsl(var(--administration))",
          foreground: "hsl(var(--administration-foreground))",
        },
        footer: { DEFAULT: "hsl(var(--footer))", foreground: "hsl(var(--footer-foreground))" },
        warning: { DEFAULT: "hsl(var(--warning))", foreground: "hsl(var(--warning-foreground))" },
        success: { DEFAULT: "hsl(var(--success))", foreground: "hsl(var(--success-foreground))" },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "var(--radius)",
        sm: "var(--radius)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
