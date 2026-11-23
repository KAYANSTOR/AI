import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent stale browser bundles from invoking Server Actions from an older
  // Railway/Vercel build during rolling deployments.
  deploymentId: (
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    'local'
  ).slice(0, 12),
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    const ownerConsole = process.env.OWNER_CONSOLE_INTERNAL_URL || 'http://127.0.0.1:8090';
    return [
      { source: '/admin', destination: `${ownerConsole}/admin` },
      { source: '/admin/:path*', destination: `${ownerConsole}/admin/:path*` },
      { source: '/api/owner', destination: `${ownerConsole}/api/owner` },
      { source: '/api/owner/:path*', destination: `${ownerConsole}/api/owner/:path*` },
      { source: '/api/owner-console/health', destination: `${ownerConsole}/api/health` },
    ];
  },
  experimental: {
    serverActions: { bodySizeLimit: '6mb' },
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "zod",
    ],
  },
};

export default nextConfig;
