/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Ensure dynamic imports resolve chunk URLs correctly
    config.output.publicPath = "/_next/";
    return config;
  },
};

module.exports = nextConfig;
