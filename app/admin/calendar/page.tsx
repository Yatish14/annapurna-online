import Link from "next/link";
import LinkPending from "@/components/admin/LinkPending";
import MonthCalendar from "@/components/admin/MonthCalendar";
import PageHeader from "@/components/admin/PageHeader";
import { requireUser } from "@/lib/auth";
import { calendarEntries } from "@/lib/bookings";
import { CAR_IDS, CARS } from "@/lib/config";
import { addDays, diffDays, MONTHS_LONG, todayIST } from "@/lib/dates";
import { calendarHref, parseMonth, readParams, type SearchParams } from "../filters";

export const metadata = { title: "Calendar" };

function monthInfo(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const nextStart = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return {
    start,
    end: addDays(nextStart, -1),
    daysInMonth: diffDays(start, nextStart),
    label: `${MONTHS_LONG[m - 1]} ${y}`,
    prev: addDays(start, -1).slice(0, 7),
    next: nextStart.slice(0, 7),
  };
}

export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser();
  const params = await readParams(searchParams);
  const month = monthInfo(parseMonth(params));
  const today = todayIST();
  const entries = await calendarEntries(month.start, month.end);

  return (
    <main className="ad-page">
      <PageHeader title="Availability" subtitle="Booked days for each car. Days with pending enquiries are outlined.">
        <div className="ad-cal-nav">
          <Link href={calendarHref(month.prev)} scroll={false} aria-label="Previous month">
            ‹<LinkPending />
          </Link>
          <strong>{month.label}</strong>
          <Link href={calendarHref(month.next)} scroll={false} aria-label="Next month">
            ›<LinkPending />
          </Link>
        </div>
      </PageHeader>

      <section className="ad-panel">
        <div className="ad-cals">
          {CAR_IDS.map((id) => (
            <MonthCalendar
              key={id}
              car={CARS[id]}
              monthStart={month.start}
              daysInMonth={month.daysInMonth}
              today={today}
              entries={entries}
            />
          ))}
        </div>
        <div className="ad-legend">
          <span>
            <i className="is-booked" /> Booked
          </span>
          <span>
            <i className="is-pending" /> Pending enquiry
          </span>
          <span>
            <i /> Free
          </span>
        </div>
      </section>
    </main>
  );
}
