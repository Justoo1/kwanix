import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  compress: true,
  // standalone output is only needed for production Docker images.
  // In development the dev server runs directly — no bundle needed.
  ...(isProd && { output: "standalone" }),
};

export default withSentryConfig(nextConfig, {
  org: "fullaxis",
  project: "javascript-nextjs",

  // Upload source maps to Sentry during production builds.
  // Requires SENTRY_AUTH_TOKEN env var — generate at:
  // https://sentry.io/settings/account/api/auth-tokens/
  silent: !isProd,
  widenClientFileUpload: true,

  // Don't include Sentry source maps in the client bundle
  sourcemaps: {
    disable: !isProd,
  },
});
