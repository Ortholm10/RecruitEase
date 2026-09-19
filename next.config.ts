import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // PDF.js loads its worker/fonts via runtime imports that bundling breaks.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
