/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";
const basePath = isProd ? "/my-diet" : "";

const nextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
