import type { NextConfig } from "next";

// Set BASE_PATH (e.g. "/prata") when hosting under a sub-path such as GitHub Pages.
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
