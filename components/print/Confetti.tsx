"use client";

import { useEffect } from "react";

/** A burst of confetti in the brand's colours (skipped for people who prefer reduced motion) */
export default function Confetti() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    const timers: number[] = [];
    import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) return;
      const colors = ["#f1d99a", "#c9a24a", "#0f6b4f", "#1f9a72", "#ffffff", "#102552"];
      const burst = (x: number, angle: number) =>
        confetti({ particleCount: 70, spread: 70, startVelocity: 55, angle, origin: { x, y: 0.7 }, colors, ticks: 260 });
      burst(0.1, 60);
      burst(0.9, 120);
      timers.push(window.setTimeout(() => confetti({ particleCount: 120, spread: 110, origin: { y: 0.35 }, colors, ticks: 300 }), 350));
    });
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);
  return null;
}
