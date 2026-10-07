import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ["preview-chat-a31e98cf-78a3-4fa7-9ebd-9d5bf09798cc.space-z.ai"],
};

export default nextConfig;
