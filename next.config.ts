import type { NextConfig } from "next";

// Security headers sent with every page.
const securityHeaders = [
  // Don't let other sites show ProjectHub inside a frame (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Don't let browsers guess file types.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't send full page addresses to other sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app never needs the camera, microphone, location or payments.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // A first Content Security Policy. A stricter script policy comes in Phase 5.
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://claude.ai https://claude.com http://localhost:* http://127.0.0.1:*; object-src 'none'",
  },
  // Always use HTTPS (only once the site is live; it would break localhost).
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Docker/Kubernetes builds (BUILD_STANDALONE=1, set in the Dockerfile)
  // package the app as a small self-contained server. Vercel builds are
  // unaffected.
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  // Cache Components is switched off: every page in ProjectHub is private to
  // the logged-in user, so there is nothing to pre-build for everyone.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
