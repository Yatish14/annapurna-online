"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";

/** Keeps an action's message in view at the top of the screen; success messages fade after a few seconds */
export default function FloatingFlash({ tone, children }: { tone: "ok" | "warn" | "error"; children: React.ReactNode }) {
  const [shown, setShown] = useState(true);

  useEffect(() => {
    if (tone !== "ok") return;
    const timer = window.setTimeout(() => setShown(false), 6000);
    return () => window.clearTimeout(timer);
  }, [tone]);

  if (!shown) return null;
  return (
    <div className="ap-flash-float">
      {children}
      <button type="button" className="ap-flash-close" aria-label="Close message" onClick={() => setShown(false)}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
