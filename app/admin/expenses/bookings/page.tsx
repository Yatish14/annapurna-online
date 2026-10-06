import Link from "next/link";
import Flash from "@/components/admin/Flash";
import Icon from "@/components/admin/Icon";
import LinkPending from "@/components/admin/LinkPending";
import OrderSearch from "@/components/admin/OrderSearch";
import PageHeader from "@/components/admin/PageHeader";
import Pagination from "@/components/admin/Pagination";
import TripCard from "@/components/expenses/TripCard";
import { can, requireUser } from "@/lib/auth";
import { listTrips, tripCounts } from "@/lib/expenses/trips";
import { pageCount, PAGE_SIZE } from "@/lib/pagination";
import { readParams, type SearchParams } from "../../filters";
import { parseTripView, TRIP_TABS, tripsHref } from "../views";

export const metadata = { title: "Bookings · Expense Tracker" };

const EMPTY: Record<string, string> = {
  all: "No bookings yet. Create the first one with “New booking”.",
  upcoming: "No upcoming bookings.",
  ongoing: "No vehicle is out on a trip today.",
  completed: "No completed bookings yet.",
  due: "Nothing to collect: every booking with a total is fully paid. 🎉",
  cancelled: "No cancelled bookings.",
};

export default async function TripsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await readParams(searchParams);
  const { view, q } = parseTripView(params);
  let { page } = parseTripView(params);

  const [counts, first] = await Promise.all([tripCounts(), listTrips(view, { search: q, page, pageSize: PAGE_SIZE })]);
  let { trips } = first;
  const { total } = first;
  const totalPages = pageCount(total);
  if (trips.length === 0 && total > 0 && page > totalPages) {
    page = totalPages;
    trips = (await listTrips(view, { search: q, page, pageSize: PAGE_SIZE })).trips;
  }
  const from = (page - 1) * PAGE_SIZE + 1;

  return (
    <main className="ap-page">
      <PageHeader eyebrow="Expense Tracker" title="Bookings" subtitle="Every booking of your vehicles, with what the customer paid and what each trip cost.">
        {can(user, "manageExpenses") && (
          <Link href="/admin/expenses/bookings/new" className="ap-btn ap-btn-gold">
            <Icon name="plus" size={16} /> New booking
          </Link>
        )}
      </PageHeader>
      <Flash params={params} />

      <section className="ap-panel">
        <div className="ap-toolbar">
          <nav className="ap-tabs" aria-label="Show">
            {TRIP_TABS.map((t) => (
              <Link key={t.id} href={tripsHref(t.id)} scroll={false} className={!q && view === t.id ? "is-active" : ""}>
                {t.label}
                <span className="ap-count">
                  <LinkPending>{counts[t.id]}</LinkPending>
                </span>
              </Link>
            ))}
          </nav>
          <OrderSearch
            key={q}
            initial={q}
            clearHref={tripsHref(view)}
            path="/admin/expenses/bookings"
            placeholder="Booking no., name or mobile"
            label="Search bookings by booking number, customer, driver or vehicle name, or mobile number"
          />
        </div>

        {q && (
          <p className="ap-searchnote">
            <Icon name="search" size={14} />
            <span>
              {total} {total === 1 ? "booking matches" : "bookings match"} <b>“{q}”</b> in all bookings
            </span>
            <Link href={tripsHref(view)} scroll={false} className="ap-link">
              Clear search
            </Link>
          </p>
        )}

        {trips.length === 0 ? (
          <div className="ap-empty">
            <Icon name="bookings" size={32} />
            <p>{q ? `No bookings match “${q}”. Try the booking number (like VB-1004), a name or a mobile number.` : EMPTY[view]}</p>
          </div>
        ) : (
          <div className="ap-list">
            {trips.map((t) => (
              <TripCard key={t.id} trip={t} />
            ))}
          </div>
        )}

        <Pagination
          page={page}
          totalPages={totalPages}
          href={(n) => tripsHref(view, { q, page: n })}
          summary={`Showing ${from}–${from + trips.length - 1} of ${total} bookings`}
        />
      </section>
    </main>
  );
}
