/** @type {import('next').NextConfig} */
const basePath = "/website";
const nextConfig = {
  output: "export",
  reactStrictMode: true,
  basePath,
  assetPrefix: basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  images: { unoptimized: true },
};

export default nextConfig;
