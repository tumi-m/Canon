import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // a second build side by side: the e2e suite builds the app with accounts on as well as off
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  images: {
    // youtube's own thumbnail cdn. the only remote host the product loads,
    // and it is the official endpoint for artwork we are already linking to.
    remotePatterns: [{ protocol: "https", hostname: "i.ytimg.com" }],
  },
};

export default nextConfig;
