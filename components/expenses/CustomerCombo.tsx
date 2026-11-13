"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmtLong } from "@/lib/dates";
import type { CustomerChoice } from "@/lib/expenses/trips";

type Props = {
  id: string;
  name: string;
  /** Everyone who has booked before (one per mobile number) */
  customers: CustomerChoice[];
  /** The name in the box */
  value: string;
  /** The mobile number in the form (to say whether this is an existing customer) */
  phone: string;
  onChange: (name: string) => void;
  /** An existing customer was chosen: fill in their name and mobile number */
  onPick: (customer: CustomerChoice) => void;
  /**
   * "New customer" was chosen. nameReady: a name is typed, so the form puts the cursor in the mobile
   * number box; otherwise the cursor stays here for the name.
   */
  onNew: (nameReady: boolean) => void;
};

const MAX_OPTIONS = 50;
const tidy = (s: string) => s.replace(/\s+/g, " ").trim();
const phoneText = (p: string) => `${p.slice(0, 5)} ${p.slice(5)}`;

/**
 * "Customer name" with the customers who have booked before, like the city box: type to find
 * someone by name or mobile number and pick them (their mobile number is filled in), or keep the
 * typed name as a new customer.
 */
export default function CustomerCombo({ id, name, customers, value, phone, onChange, onPick, onNew }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // "+ New customer" chosen before typing a name: the box waits for the name (list closed)
  const [typingNew, setTypingNew] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = `${id}-list`;

  const query = tidy(value).toLowerCase();
  const digits = /^[\d\s+()-]+$/.test(query) ? query.replace(/\D/g, "") : "";
  const options = useMemo(() => {
    if (!query) return customers.slice(0, MAX_OPTIONS);
    if (digits) return customers.filter((c) => c.phone.includes(digits)).slice(0, MAX_OPTIONS);
    const starts = customers.filter((c) => c.name.toLowerCase().startsWith(query));
    const words = customers.filter((c) => !starts.includes(c) && c.name.toLowerCase().split(" ").some((w) => w.startsWith(query)));
    const contains = customers.filter((c) => !starts.includes(c) && !words.includes(c) && c.name.toLowerCase().includes(query));
    return [...starts, ...words, ...contains].slice(0, MAX_OPTIONS);
  }, [customers, query, digits]);
  const more = !query ? customers.length - options.length : 0;

  // This name and mobile number together are someone who has booked before
  const existing = customers.find((c) => c.phone === phone && c.name.toLowerCase() === query);
  const sameName = customers.filter((c) => c.name.toLowerCase() === query);

  type Row = { kind: "customer"; customer: CustomerChoice } | { kind: "new" };
  // A new customer can share a name with an existing one, so "New customer" stays (not when searching by number)
  const showNew = !digits;
  const rows: Row[] = [...options.map((customer) => ({ kind: "customer" as const, customer })), ...(showNew ? [{ kind: "new" as const }] : [])];

  useEffect(() => setActive(0), [query, open]);
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function choose(row: Row) {
    setOpen(false);
    if (row.kind === "customer") {
      setTypingNew(false);
      onPick(row.customer);
      return;
    }
    const typed = tidy(value);
    onChange(typed);
    if (typed.length >= 2) {
      setTypingNew(false);
      onNew(true);
    } else {
      // No name yet: stay here and ask for it
      setTypingNew(true);
      onNew(false);
      input.current?.focus();
    }
  }

  const hint = existing
    ? `Existing customer · ${existing.bookings} booking${existing.bookings === 1 ? "" : "s"}, latest on ${fmtLong(existing.lastDate)}`
    : typingNew && query.length < 2
      ? "New customer: type their name, then the mobile number"
      : query.length >= 2 && !open
      ? sameName.length
        ? `${sameName.length === 1 ? "A customer" : `${sameName.length} customers`} with this name booked before: pick from the list to use their number`
        : "New customer"
      : "";

  return (
    <div className={`xp-combo xp-dd ${open && rows.length ? "is-open" : ""}`}>
      <input
        ref={input}
        id={id}
        name={name}
        type="text"
        role="combobox"
        aria-expanded={open && rows.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && rows[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        required
        minLength={2}
        maxLength={60}
        placeholder={typingNew ? "Type the new customer's name" : customers.length ? "Search customers or type a new name" : "e.g. Ravi Kumar"}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          // Typing a new customer's name: no list (it would offer existing customers again)
          if (!typingNew) setOpen(true);
        }}
        onFocus={(e) => {
          if (value) e.currentTarget.select();
          if (!typingNew) setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onBlur={() => {
          if (value !== tidy(value)) onChange(tidy(value));
          if (tidy(value).length >= 2) setTypingNew(false);
          setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) return setOpen(true);
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive((i) => (i + step + rows.length) % Math.max(rows.length, 1));
          } else if (e.key === "Enter" && open && rows[active]) {
            e.preventDefault();
            choose(rows[active]);
          } else if (e.key === "Enter" && typingNew && !open) {
            // The new customer's name is typed: Enter goes on to the mobile number (doesn't send the form)
            e.preventDefault();
            if (tidy(value).length >= 2) {
              setTypingNew(false);
              onChange(tidy(value));
              onNew(true);
            }
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            setOpen(false);
          }
        }}
      />
      {open && rows.length > 0 && (
        <ul ref={list} id={listId} role="listbox" className="xp-combo-list" aria-label="Customers">
          {options.length === 0 && query && <li className="xp-combo-note">No customer matches “{tidy(value)}”.</li>}
          {rows.map((row, i) => (
            <li
              key={row.kind === "customer" ? row.customer.phone : "new"}
              id={`${listId}-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              className={`${i === active ? "is-active" : ""} ${row.kind === "new" ? "is-other" : "xp-custopt"}`}
              // mousedown, so the choice is made before the box loses focus
              onMouseDown={(e) => {
                e.preventDefault();
                choose(row);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {row.kind === "customer" ? (
                <>
                  <span>{row.customer.name}</span>
                  <small>
                    {phoneText(row.customer.phone)} · {row.customer.bookings} booking{row.customer.bookings === 1 ? "" : "s"} · latest{" "}
                    {fmtLong(row.customer.lastDate)}
                  </small>
                </>
              ) : query ? (
                <>
                  <b>+ New customer</b> “{tidy(value)}”
                </>
              ) : (
                <>
                  <b>+ New customer</b> – not in the list? Type the name
                </>
              )}
            </li>
          ))}
          {more > 0 && <li className="xp-combo-note">Type to find the other {more} customers…</li>}
        </ul>
      )}
      <span className="mob-msg" aria-live="polite">
        {hint}
      </span>
    </div>
  );
}
