import type { Metadata } from "next";
import LaunchSplash from "@/components/admin/LaunchSplash";
import LaunchRedirect from "@/components/admin/LaunchRedirect";
import "../splash.css";

export const metadata: Metadata = { title: "Annapurna", robots: { index: false, follow: false } };

/** Where the installed app starts (manifest start_url) */
const NEXT = "/admin/print";

/**
 * The installed app's first screen: a static page, so it appears at once, with the lotus filling with gold.
 * It then opens the dashboard inside the app, and this screen stays up until the dashboard is ready
 * (signed out: the dashboard sends you on to /login, as always).
 */
export default function LaunchPage() {
  return (
    <>
      <LaunchSplash />
      <LaunchRedirect to={NEXT} />
      {/* Without JavaScript: go there the plain way */}
      <noscript>
        <meta httpEquiv="refresh" content={`0;url=${NEXT}`} />
      </noscript>
    </>
  );
}
