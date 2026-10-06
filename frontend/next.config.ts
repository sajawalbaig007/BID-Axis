import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // distDir must be relative to the project root (Next.js does not accept absolute paths).
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "react-icons"],
    // Reduces heavy Turbopack cache writes on slow disks (e.g. D: drive).
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
