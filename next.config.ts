import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // iCloud Drive skips folders ending in .nosync; syncing the build cache
  // creates "file 2" duplicates that corrupt it.
  distDir: ".next.nosync",
  // Shown in Ajustes, so the team can tell whether an update was installed.
  env: { NEXT_PUBLIC_BUILD_DATE: new Date().toISOString() },
  // pdfkit loads its font metrics from disk relative to its own files.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
