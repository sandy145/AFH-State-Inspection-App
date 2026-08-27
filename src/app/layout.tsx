import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AFH Compliance Portal",
    template: "%s · AFH Compliance Portal",
  },
  description:
    "Washington State DSHS Residential Care Services — Adult Family Home inspection and evidence portal (prototype).",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
