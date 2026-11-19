"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import Icon from "./Icon";

type Props = {
  /** The search text in the URL */
  initial: string;
  clearHref: string;
  /** The list page the search runs on */
  path?: string;
  placeholder?: string;
  label?: string;
  /** The address's name for the search text (default "q") */
  param?: string;
  /** Other parts of the address to keep while searching, e.g. "month=2026-10" */
  keep?: string;
};

/** Pause in typing before the search runs */
const DEBOUNCE_MS = 450;

/**
 * Search box for a list (print orders, Expense Tracker bookings). Searches once typing pauses,
 * without reloading the page. The box stays focused and keeps accepting typing while results load;
 * only a newer search replaces an older one.
 */
export default function OrderSearch({
  initial,
  clearHref,
  path = "/admin/print",
  placeholder = "Order no., name or mobile",
  label = "Search orders by order number, customer name or mobile number",
  param = "q",
  keep = "",
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const timer = useRef<number | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);
  // The search last sent from this box
  const last = useRef(initial.trim());

  function go(text: string) {
    window.clearTimeout(timer.current);
    const q = text.trim().slice(0, 60);
    if (q === last.current) return;
    last.current = q;
    const query = new URLSearchParams(keep);
    query.set(param, q);
    startTransition(() => router.replace(q ? `${path}?${query}` : clearHref, { scroll: false }));
  }

  // The URL changed some other way (a tab, "Clear search"): show that search, unless the person is typing here
  useEffect(() => {
    const q = initial.trim();
    if (q === last.current) return;
    last.current = q;
    if (document.activeElement !== input.current) setValue(initial);
  }, [initial]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <form
      className={`ap-search ${pending ? "is-pending" : ""}`}
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go(value);
      }}
    >
      <Icon name="search" size={16} />
      <input
        ref={input}
        type="search"
        value={value}
        onChange={(e) => {
          const text = e.target.value;
          setValue(text);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => go(text), DEBOUNCE_MS);
        }}
        placeholder={placeholder}
        aria-label={label}
        maxLength={60}
        enterKeyHint="search"
      />
      {pending && <span className="ap-link-spinner" aria-label="Searching" />}
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setValue("");
            go("");
            input.current?.focus();
          }}
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </form>
  );
}
