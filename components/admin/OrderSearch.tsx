"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import Icon from "./Icon";

/**
 * Search print orders by order number, customer name or mobile. Searches as you type
 * (after a short pause) without reloading the page.
 */
export default function OrderSearch({ initial, clearHref }: { initial: string; clearHref: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const timer = useRef<number | undefined>(undefined);
  const last = useRef(initial.trim());

  function go(text: string) {
    window.clearTimeout(timer.current);
    const q = text.trim().slice(0, 60);
    if (q === last.current) return;
    last.current = q;
    startTransition(() => router.replace(q ? `/admin/print?q=${encodeURIComponent(q)}` : clearHref, { scroll: false }));
  }

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
        type="search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          window.clearTimeout(timer.current);
          const text = e.target.value;
          timer.current = window.setTimeout(() => go(text), 350);
        }}
        placeholder="Order no., name or mobile"
        aria-label="Search orders by order number, customer name or mobile number"
        maxLength={60}
        enterKeyHint="search"
      />
      {pending ? (
        <span className="ap-link-spinner" aria-hidden="true" />
      ) : value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setValue("");
            go("");
          }}
        >
          <Icon name="close" size={14} />
        </button>
      ) : null}
    </form>
  );
}
