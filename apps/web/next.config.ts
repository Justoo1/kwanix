import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  compress: true,
  // standalone output is only needed for production Docker images.
  // In development the dev server runs directly — no bundle needed.
  ...(isProd && { output: "standalone" }),
};

export default nextConfig;
