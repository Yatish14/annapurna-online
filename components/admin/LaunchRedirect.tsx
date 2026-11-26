"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Opens `to` inside the app, right after the splash appears. A navigation keeps the current screen (the splash)
 * until the next page is ready, so the lotus keeps filling while the dashboard loads. replace, not push:
 * the phone's back button shouldn't return to the splash.
 */
export default function LaunchRedirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return null;
}
