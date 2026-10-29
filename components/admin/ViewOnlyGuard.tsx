"use client";

import { useEffect } from "react";
import { useAssist } from "@/components/assistant/AssistProvider";

/**
 * Stops anything marked locked (lib/viewOnly.ts) from doing what it would do, and says why instead:
 * a click on a locked button, link or summary, or submitting a locked form. Listens once for the
 * whole page, before the element's own handlers, so pages can lock things without code of their own.
 * Locked controls aren't real disabled buttons on purpose: those can't be clicked, so couldn't say why.
 */
export default function ViewOnlyGuard() {
  const { notify } = useAssist();

  useEffect(() => {
    const lockedFrom = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLElement>("[data-locked]") : null;

    const onClick = (e: MouseEvent) => {
      const el = lockedFrom(e.target);
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      notify(el.dataset.locked ?? "");
    };
    const onSubmit = (e: SubmitEvent) => {
      const el = lockedFrom(e.submitter) ?? lockedFrom(e.target);
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      notify(el.dataset.locked ?? "");
    };

    // auxclick: a middle-click on a locked link (open in a new tab) is stopped too
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, [notify]);

  return null;
}
