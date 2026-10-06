import Link from "next/link";
import BookingCard from "@/components/admin/BookingCard";
import Flash from "@/components/admin/Flash";
import Icon from "@/components/admin/Icon";
import LinkPending from "@/components/admin/LinkPending";
import PageHeader from "@/components/admin/PageHeader";
import { can, requireUser } from "@/lib/auth";
import { dashboardStats, listBookings, pendingConflicts } from "@/lib/bookings";
import { CAR_IDS, CARS } from "@/lib/config";
import { todayIST } from "@/lib/dates";
import { bookingsHref, parseBookingFilters, readParams, STATUS_TABS, type SearchParams } from "../../filters";

export const metadata = { title: "Bookings" };

export default async function BookingsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const canManage = can(user, "manageBookings");
  const params = await readParams(searchParams);
  const filters = parseBookingFilters(params);
  const back = bookingsHref(filters);
  const today = todayIST();

  const [stats, bookings, conflicts] = await Promise.all([
    dashboardStats(),
    listBookings(filters),
    pendingConflicts(),
  ]);

  return (
    <main className="ap-page">
      <PageHeader eyebrow="Car Bookings" title="Bookings" subtitle="Enquiries from WhatsApp, and the trips you've confirmed.">
        {!canManage && (
          <span className="ap-viewonly">
            <Icon name="eye" size={15} /> View only
          </span>
        )}
      </PageHeader>
      <Flash params={params} />

      <section className="ap-panel">
        <div className="ap-toolbar">
          <nav className="ap-tabs" aria-label="Status">
            {STATUS_TABS.map((t) => (
              <Link
                key={t.id}
                href={bookingsHref(filters, { status: t.id })}
                scroll={false}
                className={filters.status === t.id ? "is-active" : ""}
              >
                {t.label}
                <span className="ap-count">
                  <LinkPending>{stats.byStatus[t.id]}</LinkPending>
                </span>
              </Link>
            ))}
          </nav>
          <nav className="ap-pills" aria-label="Car">
            {(["all", ...CAR_IDS] as const).map((c) => (
              <Link
                key={c}
                href={bookingsHref(filters, { car: c })}
                scroll={false}
                className={filters.car === c ? "is-active" : ""}
              >
                {c === "all" ? "All cars" : CARS[c].name}
                <LinkPending />
              </Link>
            ))}
          </nav>
        </div>

        {bookings.length === 0 ? (
          <div className="ap-empty">
            <Icon name="inbox" size={32} />
            <p>
              {filters.status === "pending"
                ? "No pending enquiries. New WhatsApp enquiries will appear here."
                : "Nothing here yet."}
            </p>
          </div>
        ) : (
          <div className="ap-list">
            {bookings.map((b) => (
              <BookingCard
                key={b.id}
                b={b}
                today={today}
                back={back}
                canManage={canManage}
                conflict={conflicts.get(b.id)}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
