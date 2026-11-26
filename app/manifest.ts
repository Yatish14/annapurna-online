import type { MetadataRoute } from "next";

// The web app manifest: what phones need to install the site as an app (served at /manifest.webmanifest)
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/admin",
    name: "Annapurna Online Services",
    short_name: "Annapurna",
    description: "Bookings, expenses, print orders and Annapurna Assist for the Annapurna team.",
    // The app is for staff: it opens on the loading splash (app/launch), which goes on to the print orders,
    // the dashboard's first page (signed-out staff land on /login)
    start_url: "/launch",
    scope: "/",
    display: "standalone",
    background_color: "#0a1838",
    theme_color: "#0a1838",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
