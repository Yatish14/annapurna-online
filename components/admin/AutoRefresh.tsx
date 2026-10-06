"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** Short two-note chime (no sound file needed) */
function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1318.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + i * 0.16;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.5);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch {
    // Browsers block sound until the page has been clicked once; nothing to do
  }
}

/**
 * Reloads the page's data every few seconds while the tab is visible.
 * With `count`, plays a chime when it goes up (e.g. a new print order arrived).
 */
export default function AutoRefresh({ seconds = 15, count }: { seconds?: number; count?: number }) {
  const router = useRouter();
  const last = useRef(count);

  useEffect(() => {
    if (count !== undefined && last.current !== undefined && count > last.current) chime();
    last.current = count;
  }, [count]);

  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && router.refresh();
    const timer = window.setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, seconds]);

  return null;
}
