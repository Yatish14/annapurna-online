import Link from "next/link";
import { notFound } from "next/navigation";
import Flash from "@/components/admin/Flash";
import Icon from "@/components/admin/Icon";
import Pagination from "@/components/admin/Pagination";
import EditableHeader from "@/components/expenses/EditableHeader";
import FleetActions, { FleetStatus } from "@/components/expenses/FleetActions";
import { can, requireUser } from "@/lib/auth";
import { fmtRange, fmtShort } from "@/lib/dates";
import { getDriver } from "@/lib/expenses/fleet";
import { formatNumber, formatRupees, PAYMENT_METHODS } from "@/lib/expenses/money";
import { driverOwed, driverPayments, driverSummary, driverTrips, driverUnpaidTrips, PHASE_LABELS, routeText } from "@/lib/expenses/trips";
import { formatPhone } from "@/lib/format";
import { pageCount, PAGE_SIZE, parsePage } from "@/lib/pagination";
import { readParams, type SearchParams } from "../../../../filters";
import { driverStatus, editDriver } from "../../actions";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const driver = await getDriver(Number((await params).id));
  return { title: driver ? driver.name : "Driver" };
}

export default async function DriverPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const user = await requireUser();
  const canManage = can(user, "manageExpenses");
  const driver = await getDriver(Number((await params).id));
  if (!driver) notFound();
  const query = await readParams(searchParams);
  const pages = { payments: parsePage(query.get("payments")), bookings: parsePage(query.get("bookings")) };

  const [summary, unpaid, payments, trips] = await Promise.all([
    driverSummary(driver.id),
    driverUnpaidTrips(driver.id),
    driverPayments(driver.id, { page: pages.payments, pageSize: PAGE_SIZE }),
    driverTrips(driver.id, { page: pages.bookings, pageSize: PAGE_SIZE }),
  ]);
  const base = `/admin/expenses/fleet/drivers/${driver.id}`;
  const href = (key: "payments" | "bookings", n: number) => {
    const p = new URLSearchParams();
    for (const k of ["payments", "bookings"] as const) {
      const page = k === key ? n : pages[k];
      if (page > 1) p.set(k, String(page));
    }
    return `${base}${p.size ? `?${p}` : ""}#${key}`;
  };

  const tiles = [
    { label: "Bookings", value: String(summary.bookings), tone: "navy" },
    { label: "Days driven", value: String(summary.days), tone: "navy" },
    { label: "Km driven", value: formatNumber(summary.km), tone: "navy" },
    { label: "Earned", value: formatRupees(summary.earned), sub: "Agreed driver amounts", tone: "plum" },
    { label: "Paid", value: formatRupees(summary.paid), tone: "green" },
    { label: "Still to pay", value: formatRupees(summary.owed), tone: summary.owed > 0 ? "red" : "green" },
  ];

  return (
    <main className="ap-page">
      <Link href="/admin/expenses/fleet" className="ap-link xp-back">
        <Icon name="arrow" size={15} className="xp-flip" /> Vehicles & drivers
      </Link>
      <EditableHeader
        key={`${driver.name}-${driver.phone}`}
        eyebrow="Expense Tracker · Driver"
        title={driver.name}
        subtitle={
          <>
            Mobile{" "}
            <a href={`tel:+91${driver.phone}`} className="xp-phone">
              {formatPhone(driver.phone)}
            </a>{" "}
            · added {driver.created_ist}
          </>
        }
        id={driver.id}
        fields={[
          { name: "name", label: "Driver name", value: driver.name },
          { name: "phone", label: "Mobile number", value: driver.phone, kind: "mobile" },
        ]}
        action={editDriver}
        canEdit={canManage}
        editLabel="Edit name or mobile"
      >
        {driver.is_sample && <span className="ap-badge is-sample">Sample</span>}
        <FleetStatus active={driver.active} onTrip={driver.on_trip} />
        <a href={`tel:+91${driver.phone}`} className="ap-btn ap-btn-ghost ap-btn-sm">
          <Icon name="phone" size={13} /> Call
        </a>
        {canManage && (
          <FleetActions
            id={driver.id}
            name={driver.name}
            kind="driver"
            active={driver.active}
            used={driver.used}
            statusAction={driverStatus}
          />
        )}
      </EditableHeader>
      <Flash params={query} floating />
      {!driver.active && (
        <p className="ap-alert ap-alert-warn">This driver is switched off: they can&apos;t be picked for new bookings. Their history is kept.</p>
      )}

      <section className="xp-sumtiles">
        {tiles.map((t) => (
          <div key={t.label} className={`xp-sumtile is-${t.tone}`}>
            <span>{t.label}</span>
            <strong>{t.value}</strong>
            {t.sub && <small>{t.sub}</small>}
          </div>
        ))}
      </section>

      <div className="xp-detail">
        <section className="ap-panel" id="unpaid">
          <div className="ap-panel-head">
            <h2>Still to pay</h2>
            <span className={summary.owed > 0 ? "xp-owed" : "ap-muted"}>{formatRupees(summary.owed)}</span>
          </div>
          {unpaid.length === 0 ? (
            <p className="ap-empty-sm">Nothing owed: every booking is settled. ✨</p>
          ) : (
            <>
              <ul className="ap-rows">
                {unpaid.map((t) => (
                  <li key={t.id} className="ap-row xp-rowlink">
                    <div className="ap-row-main">
                      <Link href={`/admin/expenses/bookings/${t.trip_no}#driver-payments`} className="xp-cardlink">
                        <strong>
                          {t.trip_no} · {t.customer_name}
                        </strong>
                      </Link>
                      <span>
                        {fmtRange(t.start_date, t.end_date)} · {t.vehicle_name} · paid {formatRupees(t.driver_paid)} of{" "}
                        {formatRupees(t.driver_amount ?? 0)}
                      </span>
                    </div>
                    <b className="xp-owed xp-nowrap">{formatRupees(driverOwed(t))}</b>
                  </li>
                ))}
              </ul>
              <p className="ap-hint">Open a booking to record a payment to {driver.name}.</p>
            </>
          )}
        </section>

        <section className="ap-panel xp-money" id="payments">
          <div className="ap-panel-head">
            <h2>
              <Icon name="wallet" size={18} /> Payments to {driver.name}
            </h2>
            <span className="xp-total">{formatRupees(summary.paid)}</span>
          </div>
          {payments.total === 0 ? (
            <p className="ap-empty-sm">No payments to this driver yet.</p>
          ) : (
            <ul className="xp-ledger">
              {payments.payments.map((p) => (
                <li key={p.id} className={p.deleted_ist ? "is-removed" : ""}>
                  <div className="xp-ledger-main">
                    <strong>{formatRupees(p.amount)}</strong>
                    <span className="ap-chip">{PAYMENT_METHODS[p.method]}</span>
                    <Link href={`/admin/expenses/bookings/${p.trip_no}#driver-payments`} className="ap-chip xp-chiplink">
                      {p.trip_no}
                    </Link>
                    {p.note && <span className="xp-ledger-note">{p.note}</span>}
                  </div>
                  <div className="xp-ledger-meta">
                    <span>
                      <Icon name="clock" size={13} /> Paid {p.paid_ist}
                    </span>
                    <span>
                      Recorded by <b>{p.created_by ?? "—"}</b>
                      {p.late_entry ? ` on ${p.created_ist}` : ""}
                    </span>
                    {p.deleted_ist && (
                      <span className="xp-removed">
                        Removed by <b>{p.deleted_by ?? "—"}</b> · {p.deleted_ist}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Pagination
            page={pages.payments}
            totalPages={pageCount(payments.total)}
            href={(n) => href("payments", n)}
            summary={`${payments.total} payments`}
          />
        </section>
      </div>

      <section className="ap-panel" id="bookings">
        <div className="ap-panel-head">
          <h2>Bookings</h2>
          <span className="ap-muted">
            {trips.total} booking{trips.total === 1 ? "" : "s"}
          </span>
        </div>
        {trips.trips.length === 0 ? (
          <p className="ap-empty-sm">No bookings yet.</p>
        ) : (
          <ul className="ap-rows">
            {trips.trips.map((t) => (
              <li key={t.id} className="ap-row xp-rowlink">
                <span className="ap-datechip">
                  <strong>{Number(t.start_date.slice(8))}</strong>
                  <small>{fmtShort(t.start_date).slice(-3)}</small>
                </span>
                <div className="ap-row-main">
                  <Link href={`/admin/expenses/bookings/${t.trip_no}`} className="xp-cardlink">
                    <strong>{t.customer_name}</strong>
                  </Link>
                  <span>
                    {routeText(t)} · {fmtRange(t.start_date, t.end_date)} · {t.vehicle_name}
                    {t.driver_amount !== null && ` · ${formatRupees(t.driver_amount)}`}
                  </span>
                </div>
                <span className={`ap-badge xp-phase is-${t.phase}`}>{PHASE_LABELS[t.phase]}</span>
                <span className="ap-row-ref">{t.trip_no}</span>
              </li>
            ))}
          </ul>
        )}
        <Pagination
          page={pages.bookings}
          totalPages={pageCount(trips.total)}
          href={(n) => href("bookings", n)}
          summary={`${trips.total} bookings`}
        />
      </section>
    </main>
  );
}
