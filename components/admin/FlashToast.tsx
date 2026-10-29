"use client";

import { useEffect } from "react";
import { useToast, type ToastTone } from "@/components/Toaster";

/**
 * Shows an action's result (?flash=…) as a toast, once, then takes flash and ref out of the address,
 * so refreshing the page or going back doesn't show it again. The rest of the address (and #section) stays.
 */
export default function FlashToast({ tone, message }: { tone: ToastTone; message: string }) {
  const { notify } = useToast();

  useEffect(() => {
    notify(message, tone);
    const url = new URL(window.location.href);
    if (url.searchParams.has("flash") || url.searchParams.has("ref")) {
      url.searchParams.delete("flash");
      url.searchParams.delete("ref");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, [notify, tone, message]);

  return null;
}
