import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // iCloud Drive skips folders ending in .nosync; syncing the build cache
  // creates "file 2" duplicates that corrupt it.
  distDir: ".next.nosync",
  // pdfkit loads its font metrics from disk relative to its own files.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
