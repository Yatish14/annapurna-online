"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { focusFirstInvalid } from "@/components/focusFirstInvalid";
import Dropdown from "@/components/Dropdown";
import { CITY_MAX, loadCities, STATES } from "@/lib/expenses/places";

const STATE_OPTIONS = STATES.map((s) => ({ value: s, label: s }));

type Value = { state: string; city: string };

type Props = {
  /** e.g. "Pickup" → "Pickup state", "Pickup city" */
  label: string;
  stateName: string;
  cityName: string;
  required?: boolean;
  /** Controlled use (the booking form); leave out inside a plain form */
  value?: Value;
  onChange?: (value: Value) => void;
  defaultValue?: Value;
  cityPlaceholder?: string;
};

/**
 * State dropdown + city picker. The city can only be chosen once a state is selected, changing the
 * state clears the city, and a place that isn't in the list can be typed in ("Other").
 */
export default function PlacePicker({
  label,
  stateName,
  cityName,
  required = false,
  value: controlled,
  onChange,
  defaultValue = { state: "", city: "" },
  cityPlaceholder,
}: Props) {
  const [own, setOwn] = useState<Value>(defaultValue);
  const value = controlled ?? own;
  const id = useId();

  function update(next: Value) {
    if (!controlled) setOwn(next);
    onChange?.(next);
  }

  return (
    <div className="xp-place">
      <div className="ap-field">
        <label htmlFor={`${id}-state`}>{label} state</label>
        <Dropdown
          id={`${id}-state`}
          name={stateName}
          options={STATE_OPTIONS}
          required={required}
          emptyLabel={required ? undefined : "No state"}
          placeholder={required ? "Select state" : "Select state (optional)"}
          requiredMessage={`Choose the ${label.toLowerCase()} state.`}
          value={value.state}
          onChange={(state) => state !== value.state && update({ state, city: "" })}
        />
      </div>
      <div className="ap-field">
        <label htmlFor={`${id}-city`}>{label} city</label>
        <CityCombo
          id={`${id}-city`}
          name={cityName}
          state={value.state}
          value={value.city}
          required={required || Boolean(value.state)}
          placeholder={cityPlaceholder}
          onChange={(city) => update({ ...value, city })}
        />
      </div>
    </div>
  );
}

const MAX_OPTIONS = 80;

function CityCombo({
  id,
  name,
  state,
  value,
  required,
  placeholder = "Search or type the city",
  onChange,
}: {
  id: string;
  name: string;
  state: string;
  value: string;
  required: boolean;
  placeholder?: string;
  onChange: (city: string) => void;
}) {
  const [cities, setCities] = useState<string[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // "Other" picked: the person is typing a name that isn't in the list
  const [typingOther, setTypingOther] = useState(false);
  const [touched, setTouched] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = `${id}-list`;

  useEffect(() => {
    let live = true;
    setCities(null);
    if (state) loadCities().then((all) => live && setCities(all[state] ?? []));
    return () => {
      live = false;
    };
  }, [state]);

  useEffect(() => setTypingOther(false), [state]);

  const query = value.trim().toLowerCase();
  const exact = cities?.find((c) => c.toLowerCase() === query);
  const options = useMemo(() => {
    if (!cities) return [];
    if (!query) return cities.slice(0, MAX_OPTIONS);
    const starts = cities.filter((c) => c.toLowerCase().startsWith(query));
    const contains = cities.filter((c) => !c.toLowerCase().startsWith(query) && c.toLowerCase().includes(query));
    return [...starts, ...contains].slice(0, MAX_OPTIONS);
  }, [cities, query]);
  const more = cities && !query ? cities.length - options.length : 0;

  // Last row: "Other" when nothing is typed, or "Use “…”" for a name that isn't in the list
  type Row = { kind: "city"; city: string } | { kind: "other" } | { kind: "typed" };
  const rows: Row[] = [
    ...options.map((city) => ({ kind: "city" as const, city })),
    ...(query && !exact ? [{ kind: "typed" as const }] : !query ? [{ kind: "other" as const }] : []),
  ];

  const problem = !state ? (required ? "Select the state first." : "") : required && !query ? "Choose or type the city." : "";
  const notInList = Boolean(cities && query && !exact);

  useEffect(() => {
    input.current?.setCustomValidity(problem);
  }, [problem]);

  useEffect(() => setActive(0), [query, open]);

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function choose(row: Row) {
    if (row.kind === "city") {
      onChange(row.city);
      setTypingOther(false);
      setOpen(false);
    } else if (row.kind === "other") {
      onChange("");
      setTypingOther(true);
      setOpen(false);
      input.current?.focus();
    } else {
      onChange(value.replace(/\s+/g, " ").trim());
      setOpen(false);
    }
  }

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
        maxLength={CITY_MAX}
        disabled={!state}
        required={required}
        placeholder={!state ? "Select the state first" : typingOther ? "Type the city, town or village" : placeholder}
        className={touched && problem ? "is-invalid" : undefined}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => {
          // A city is already chosen: select it, so typing replaces it
          if (value) e.currentTarget.select();
          if (!typingOther) setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onBlur={() => {
          // Same name as a listed city in different capitals: use the list's spelling
          if (exact && exact !== value) onChange(exact);
          else if (value !== value.replace(/\s+/g, " ").trim()) onChange(value.replace(/\s+/g, " ").trim());
          if (value) setTouched(true);
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
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            setOpen(false);
          }
        }}
        onInvalid={(e) => {
          e.preventDefault();
          setTouched(true);
          focusFirstInvalid(e.currentTarget);
        }}
      />
      {open && state && (
        <ul ref={list} id={listId} role="listbox" className="xp-combo-list" aria-label="Cities">
          {!cities && <li className="xp-combo-note">Loading cities…</li>}
          {rows.map((row, i) => (
            <li
              key={row.kind === "city" ? row.city : row.kind}
              id={`${listId}-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              className={`${i === active ? "is-active" : ""} ${row.kind !== "city" ? "is-other" : ""}`}
              // mousedown, so the choice is made before the input loses focus
              onMouseDown={(e) => {
                e.preventDefault();
                choose(row);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {row.kind === "city" ? (
                row.city
              ) : row.kind === "other" ? (
                <>
                  <b>Other</b> – not in the list? Type the name
                </>
              ) : (
                <>
                  Use <b>“{value.trim()}”</b> (not in the list)
                </>
              )}
            </li>
          ))}
          {more > 0 && <li className="xp-combo-note">Type to find the other {more} places…</li>}
        </ul>
      )}
      <span className={`mob-msg ${touched && problem ? "is-error" : ""}`} aria-live="polite">
        {touched && problem ? problem : notInList && !open ? "Not in the list: it will be saved as typed." : ""}
      </span>
    </div>
  );
}
