import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent stale browser bundles from invoking Server Actions from an older
  // Railway/Vercel build during rolling deployments.
  deploymentId:
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    'local',
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "zod",
    ],
  },
};

export default nextConfig;
