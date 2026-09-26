import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit loads its font metrics from disk relative to its own files.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
