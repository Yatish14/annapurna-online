"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Period } from "@/app/admin/filters";
import Icon from "@/components/admin/Icon";
import { fmtLong, MONTHS_LONG } from "@/lib/dates";

type Props = {
  /** The page the filter belongs to, e.g. /admin/expenses/fleet/drivers/3 */
  base: string;
  period: Period;
  /** Today in India, "YYYY-MM-DD" */
  today: string;
};

const monthName = (m: string) => `${MONTHS_LONG[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
const shiftMonth = (m: string, by: number) =>
  new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5)) - 1 + by, 1)).toISOString().slice(0, 7);

/** ?from=…&to=… for the dates chosen (either may be open) */
function datesQuery(p: Period): string {
  const q = new URLSearchParams();
  if (p.from) q.set("from", p.from);
  if (p.to) q.set("to", p.to);
  return `?${q}`;
}

/** Opens the browser's own picker when the visible label is clicked (the input sits invisibly on top of it) */
function openPicker(e: React.MouseEvent<HTMLInputElement>) {
  try {
    e.currentTarget.showPicker?.();
  } catch {
    // Older browsers: tapping the input itself still opens it
  }
}

/**
 * All time / Month / Dates. Month: arrows and the month name (tap it to pick a month). Dates: from → to, each
 * tapped to change; From can't be after To. Every change applies at once.
 */
export default function PeriodFilter({ base, period, today }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const thisMonth = today.slice(0, 7);
  const go = (query: string) => {
    setError("");
    startTransition(() => router.push(`${base}${query}`, { scroll: false }));
  };
  const setDates = (from: string, to: string) => {
    if (from && to && from > to) return setError("From must be on or before To.");
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    go(`?${q}`);
  };

  const tabs = [
    { id: "all", label: "All time", href: base },
    { id: "month", label: "Month", href: `${base}?month=${period.kind === "month" ? period.month : thisMonth}` },
    // Dates always starts on this month so far (1st to today), not on the month being looked at
    { id: "dates", label: "Dates", href: period.kind === "dates" ? `${base}${datesQuery(period)}` : `${base}?from=${thisMonth}-01&to=${today}` },
  ];

  return (
    <div className={`xp-period${pending ? " is-pending" : ""}`} aria-busy={pending}>
      <nav className="xp-seg" aria-label="Show">
        {tabs.map((t) => (
          <Link key={t.id} href={t.href} scroll={false} className={period.kind === t.id ? "is-active" : ""} aria-current={period.kind === t.id ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>

      {period.kind === "month" && (
        <div className="xp-periodctl">
          <Link href={`${base}?month=${shiftMonth(period.month, -1)}`} scroll={false} className="xp-periodstep" aria-label="Previous month">
            <Icon name="chevron" size={16} className="xp-flip" />
          </Link>
          <label className="xp-periodpick">
            <Icon name="calendar" size={15} />
            <span>{monthName(period.month)}</span>
            <input
              key={period.month}
              id="period-month"
              type="month"
              aria-label="Month"
              defaultValue={period.month}
              min="2020-01"
              max="2099-12"
              onClick={openPicker}
              onChange={(e) => e.target.value && go(`?month=${e.target.value}`)}
            />
          </label>
          <Link href={`${base}?month=${shiftMonth(period.month, 1)}`} scroll={false} className="xp-periodstep" aria-label="Next month">
            <Icon name="chevron" size={16} />
          </Link>
        </div>
      )}

      {period.kind === "dates" && (
        <div className="xp-periodctl" key={`${period.from}-${period.to}`}>
          <label className="xp-periodpick">
            <Icon name="calendar" size={15} />
            <span>{period.from ? fmtLong(period.from) : "Any start"}</span>
            <input
              id="period-from"
              type="date"
              aria-label="From"
              defaultValue={period.from ?? ""}
              min="2020-01-01"
              // From can't be after To
              max={period.to ?? "2099-12-31"}
              onClick={openPicker}
              onChange={(e) => setDates(e.target.value, period.to ?? "")}
            />
          </label>
          <span className="xp-periodto" aria-hidden="true">
            →
          </span>
          <label className="xp-periodpick">
            <span>{period.to ? fmtLong(period.to) : "Any end"}</span>
            <input
              id="period-to"
              type="date"
              aria-label="To"
              defaultValue={period.to ?? ""}
              // To can't be before From
              min={period.from ?? "2020-01-01"}
              max="2099-12-31"
              onClick={openPicker}
              onChange={(e) => setDates(period.from ?? "", e.target.value)}
            />
          </label>
        </div>
      )}

      {error && (
        <p className="xp-perioderror" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
