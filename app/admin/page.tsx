import Link from "next/link";
import Flash from "@/components/admin/Flash";
import Icon from "@/components/admin/Icon";
import PageHeader from "@/components/admin/PageHeader";
import { requireUser } from "@/lib/auth";
import { dashboardStats, latestPending, upcomingTrips, type Booking } from "@/lib/bookings";
import { CAR_IDS, CARS, passengersText } from "@/lib/config";
import { daysText, diffDays, fmtDayMonth, fmtRange, fmtShort, todayIST } from "@/lib/dates";
import { readParams, type SearchParams } from "./filters";

export const metadata = { title: "Overview" };

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function longToday(): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function TripRow({ b }: { b: Booking }) {
  const days = diffDays(b.start_date, b.end_date) + 1;
  return (
    <li className="ap-row">
      <span className="ap-datechip">
        <strong>{Number(b.start_date.slice(8))}</strong>
        <small>{fmtShort(b.start_date).slice(-3)}</small>
      </span>
      <div className="ap-row-main">
        <strong>{b.customer_name || "WhatsApp customer"}</strong>
        <span>
          {CARS[b.car].name} · {passengersText(b.adults, b.children)} · {fmtRange(b.start_date, b.end_date)} ({daysText(days)})
        </span>
      </div>
      <span className="ap-row-ref">{b.ref}</span>
    </li>
  );
}

export default async function OverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await readParams(searchParams);
  const today = todayIST();

  const [stats, pending, trips] = await Promise.all([dashboardStats(), latestPending(5), upcomingTrips(30)]);

  const fleet = CAR_IDS.map((id) => {
    const current = trips.find((t) => t.car === id && t.start_date <= today && t.end_date >= today);
    const next = trips.find((t) => t.car === id && t.start_date > today);
    return { car: CARS[id], current, next };
  });

  const tiles = [
    { label: "Pending enquiries", value: stats.pending, icon: "inbox" as const, tone: "gold", href: "/admin/bookings?status=pending&car=all" },
    { label: "Upcoming bookings", value: stats.upcoming, icon: "check" as const, tone: "green", href: "/admin/bookings?status=confirmed&car=all" },
    { label: "On a trip today", value: stats.onTripToday, icon: "car" as const, tone: "navy" },
    { label: "Booked this month", value: stats.bookedThisMonth, icon: "chart" as const, tone: "plum" },
  ];

  return (
    <main className="ap-page">
      <PageHeader
        eyebrow={longToday()}
        title={`${greeting()}, ${user.name.split(" ")[0]}`}
        subtitle="Here's what's happening with your cars today."
      />
      <Flash params={params} />

      <section className="ap-tiles">
        {tiles.map((t) => {
          const body = (
            <>
              <span className={`ap-tile-icon is-${t.tone}`}>
                <Icon name={t.icon} size={20} />
              </span>
              <span className="ap-tile-label">{t.label}</span>
              <strong className="ap-tile-value">{t.value}</strong>
            </>
          );
          return t.href ? (
            <Link key={t.label} href={t.href} className="ap-tile is-link">
              {body}
            </Link>
          ) : (
            <div key={t.label} className="ap-tile">
              {body}
            </div>
          );
        })}
      </section>

      <div className="ap-grid-2">
        <section className="ap-panel">
          <div className="ap-panel-head">
            <h2>Needs your attention</h2>
            <Link href="/admin/bookings?status=pending&car=all" className="ap-link">
              View all <Icon name="arrow" size={15} />
            </Link>
          </div>
          {pending.length === 0 ? (
            <p className="ap-empty-sm">No pending enquiries. You're all caught up. ✨</p>
          ) : (
            <ul className="ap-rows">
              {pending.map((b) => (
                <TripRow key={b.id} b={b} />
              ))}
            </ul>
          )}
        </section>

        <section className="ap-panel">
          <div className="ap-panel-head">
            <h2>Fleet today</h2>
            <Link href="/admin/calendar" className="ap-link">
              Calendar <Icon name="arrow" size={15} />
            </Link>
          </div>
          <div className="ap-fleet">
            {fleet.map(({ car, current, next }) => (
              <div key={car.id} className={`ap-fleet-card ${current ? "is-out" : "is-free"}`}>
                <div className="ap-fleet-top">
                  <span className="ap-fleet-icon">
                    <Icon name="car" size={22} />
                  </span>
                  <div>
                    <strong>{car.name}</strong>
                    <span>
                      Up to {car.maxAdults === car.maxTotal ? `${car.maxTotal} passengers` : `${car.maxAdults} adults · ${car.maxTotal} with children`}
                    </span>
                  </div>
                  <span className="ap-fleet-status">{current ? "On a trip" : "Available"}</span>
                </div>
                <p>
                  {current
                    ? `${current.ref} · ${current.customer_name || "Customer"} · back after ${fmtDayMonth(current.end_date)}`
                    : next
                      ? `Next trip: ${fmtShort(next.start_date)} (${next.ref})`
                      : "No upcoming bookings"}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="ap-panel">
        <div className="ap-panel-head">
          <h2>Upcoming trips</h2>
          <Link href="/admin/bookings?status=confirmed&car=all" className="ap-link">
            All bookings <Icon name="arrow" size={15} />
          </Link>
        </div>
        {trips.length === 0 ? (
          <p className="ap-empty-sm">No upcoming trips yet.</p>
        ) : (
          <ul className="ap-rows">
            {trips.slice(0, 6).map((b) => (
              <TripRow key={b.id} b={b} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
