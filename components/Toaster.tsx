"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Icon, { type IconName } from "@/components/admin/Icon";

/**
 * Toasts: one short message at the top right of the screen (across the top on phones). It slides in from
 * the right, and slides back out on close or after a while (longer for warnings and errors). A new one
 * replaces the one showing. Used for every action's result (components/admin/Flash.tsx), signing in and
 * out, and for "view only" messages.
 */
export type ToastTone = "ok" | "warn" | "error" | "info";

const TONES: Record<ToastTone, { icon: IconName; seconds: number }> = {
  ok: { icon: "check", seconds: 4 },
  info: { icon: "shield", seconds: 4 },
  warn: { icon: "shield", seconds: 7 },
  error: { icon: "xcircle", seconds: 8 },
};

type Toast = { id: number; message: string; tone: ToastTone; leaving?: boolean };
type Store = { notify: (message: string, tone?: ToastTone) => void };

const ToastContext = createContext<Store>({ notify: () => {} });

/** notify("Saved.", "ok"). Outside the provider it does nothing. */
export function useToast(): Store {
  return useContext(ToastContext);
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);

  const notify = useCallback((message: string, tone: ToastTone = "info") => {
    if (message) setToast({ id: Date.now() + Math.random(), message, tone });
  }, []);
  const close = () => setToast((t) => t && { ...t, leaving: true });

  // Slides out after its time; a new toast restarts the clock
  useEffect(() => {
    if (!toast || toast.leaving) return;
    const timer = window.setTimeout(close, TONES[toast.tone].seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const store = useMemo(() => ({ notify }), [notify]);
  return (
    <ToastContext.Provider value={store}>
      {children}
      {toast && (
        // key: the same message twice still replays the animation
        <div
          key={toast.id}
          className={`toast is-${toast.tone}${toast.leaving ? " is-leaving" : ""}`}
          role={toast.tone === "error" ? "alert" : "status"}
          style={{ "--toast-seconds": `${TONES[toast.tone].seconds}s` } as React.CSSProperties}
          onAnimationEnd={(e) => e.animationName === "toast-out" && setToast(null)}
        >
          <Icon name={TONES[toast.tone].icon} size={17} />
          <span>{toast.message}</span>
          <button type="button" onClick={close} aria-label="Close message">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
