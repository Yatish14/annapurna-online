import type { NextConfig } from "next";

const noIndex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];

const nextConfig: NextConfig = {
  // PGlite (local dev database) ships WASM files and must not be bundled
  serverExternalPackages: ["@electric-sql/pglite"],
  async headers() {
    return [
      { source: "/login", headers: noIndex },
      { source: "/admin/:path*", headers: noIndex },
      { source: "/admin", headers: noIndex },
    ];
  },
};

export default nextConfig;
