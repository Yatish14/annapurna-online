"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "@/components/admin/Icon";
import Assistant from "./Assistant";

/**
 * The "Ask Assist" button on every admin page, and the chat it opens on the right.
 * Desktop: the page moves over to make room (CSS in admin.css). Phones: the chat covers the screen.
 * It lives in the admin layout, so the chat stays open while you move between pages.
 */
export default function AssistPanel() {
  const pathname = usePathname();
  // The full page already is the assistant
  const onAssistPage = pathname.startsWith("/admin/assistant");
  const [open, setOpen] = useState(false);
  const isOpen = open && !onAssistPage;
  const panel = useRef<HTMLElement>(null);
  /** How far down the page was, so opening or closing the chat doesn't jump it back to the top */
  const pageY = useRef<number | null>(null);

  const content = () => document.querySelector<HTMLElement>(".ap-content");
  const isDesktop = () => window.matchMedia("(min-width: 1001px)").matches;

  // Desktop: while the chat is open the page scrolls inside .ap-content instead of the window (admin.css).
  // Read the position before the switch…
  function openPanel() {
    pageY.current = window.scrollY;
    setOpen(true);
  }
  function closePanel() {
    pageY.current = content()?.scrollTop ?? 0;
    setOpen(false);
  }
  // …and put it back right after, before the browser paints. Only after a button or Escape:
  // not on first load (the browser restores the scroll itself) or when moving to another page.
  useLayoutEffect(() => {
    const y = pageY.current;
    pageY.current = null;
    if (y === null || !isDesktop()) return;
    if (isOpen) content()?.scrollTo({ top: y });
    else window.scrollTo({ top: y });
  }, [isOpen]);

  // Desktop: ready to type as soon as it opens (on phones that would pop the keyboard over the suggestions)
  useEffect(() => {
    if (isOpen && isDesktop()) panel.current?.querySelector("textarea")?.focus({ preventScroll: true });
  }, [isOpen]);

  // Escape closes it (unless something inside, like the language menu, used the key)
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector(".xp-modal-backdrop")) closePanel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen]);

  return (
    <>
      {!onAssistPage && (
        <button
          type="button"
          className={`as-fab ${isOpen ? "is-hidden" : ""}`}
          onClick={openPanel}
          aria-label="Ask Annapurna Assist"
          aria-expanded={isOpen}
          aria-controls="as-panel"
        >
          <Icon name="sparkle" size={20} />
          <span>Ask Assist</span>
        </button>
      )}
      {/* inert while closed: off screen, so it can't be tabbed into or read out */}
      <aside id="as-panel" ref={panel} className={`as-panel ${isOpen ? "is-open" : ""}`} aria-label="Annapurna Assist" inert={!isOpen}>
        <Assistant variant="panel" onClose={closePanel} />
      </aside>
    </>
  );
}
