import type { NextConfig } from "next";

const noIndex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];

const nextConfig: NextConfig = {
  // PGlite (local dev database) ships WASM files and must not be bundled
  serverExternalPackages: ["@electric-sql/pglite"],
  // The expense statement PDF reads its font files from assets/fonts at run time
  outputFileTracingIncludes: {
    "/admin/expenses/bookings/**": ["./assets/fonts/**/*"],
  },
  async headers() {
    return [
      { source: "/login", headers: noIndex },
      { source: "/admin/:path*", headers: noIndex },
      { source: "/admin", headers: noIndex },
      { source: "/print/:path*", headers: noIndex },
      { source: "/print", headers: noIndex },
    ];
  },
  // Car pages moved under Car Bookings; keep old bookmarks working
  async redirects() {
    return [
      { source: "/admin/bookings", destination: "/admin/cars/bookings", permanent: false },
      { source: "/admin/calendar", destination: "/admin/cars/calendar", permanent: false },
      { source: "/admin/activity", destination: "/admin/cars/activity", permanent: false },
    ];
  },
};

export default nextConfig;
