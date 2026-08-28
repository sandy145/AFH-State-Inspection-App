import type { NextConfig } from "next";
import { resolveUploadLimits } from "./src/lib/upload-limits";

// Next.js caps server-action request bodies at 1 MB unless told otherwise. The
// evidence upload is a server action, so that default silently overrode the
// application's own limit and rejected ordinary documents.
const { bodySizeLimitBytes } = resolveUploadLimits(process.env);

/**
 * Secure headers are applied here rather than in a proxy so the prototype
 * behaves the same however it is hosted. A production deployment should also
 * set these at the edge (Azure Front Door / App Gateway).
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js injects inline bootstrap scripts; styles come from Tailwind's
      // compiled sheet plus React's inline style attributes.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "connect-src 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client", "nodemailer"],
  experimental: {
    serverActions: { bodySizeLimit: bodySizeLimitBytes },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
