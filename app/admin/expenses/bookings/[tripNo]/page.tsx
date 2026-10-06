import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityEntry } from "@/components/admin/ActivityFeed";
import Flash from "@/components/admin/Flash";
import Icon from "@/components/admin/Icon";
import PageHeader from "@/components/admin/PageHeader";
import SubmitButton from "@/components/admin/SubmitButton";
import Expenses from "@/components/expenses/Expenses";
import Payments from "@/components/expenses/Payments";
import { TripBadges } from "@/components/expenses/TripCard";
import { listTargetActivity } from "@/lib/activity";
import { can, requireUser } from "@/lib/auth";
import { daysText, diffDays, fmtRange, nowLocalIST, todayIST } from "@/lib/dates";
import { formatNumber, formatRupees } from "@/lib/expenses/money";
import { placeText } from "@/lib/expenses/places";
import {
  balanceOf,
  driverOwed,
  getTrip,
  kmOf,
  listPayments,
  profitOf,
  profitWhenPaid,
  routeText,
  tripExpenses,
} from "@/lib/expenses/trips";
import { formatPhone } from "@/lib/format";
import { readParams, type SearchParams } from "../../../filters";
import { changeTripStatus, saveReadings } from "../actions";

type Params = Promise<{ tripNo: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  return { title: `Booking ${(await params).tripNo}` };
}

export default async function TripPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const user = await requireUser();
  const canManage = can(user, "manageExpenses");
  const { tripNo } = await params;
  const trip = await getTrip(decodeURIComponent(tripNo));
  if (!trip) notFound();

  const [query, payments, expenses, history] = await Promise.all([
    readParams(searchParams),
    listPayments(trip.id),
    tripExpenses(trip.id),
    can(user, "viewActivity") ? listTargetActivity("expenses", trip.trip_no) : Promise.resolve(null),
  ]);
  const days = diffDays(trip.start_date, trip.end_date) + 1;
  const km = kmOf(trip);
  const profit = profitOf(trip);
  const whenPaid = profitWhenPaid(trip);
  const active = trip.status === "booked";
  const editable = canManage && active;

  const tiles = [
    { label: "Total", value: trip.total_amount === null ? "Not set" : formatRupees(trip.total_amount), tone: "navy" },
    { label: "Received", value: formatRupees(trip.received), tone: "green" },
    { label: "Balance due", value: trip.total_amount === null ? "—" : formatRupees(balanceOf(trip)), tone: balanceOf(trip) > 0 ? "red" : "green" },
    {
      label: "Driver",
      value: trip.driver_amount === null ? "Not set" : formatRupees(trip.driver_amount),
      sub: trip.driver_amount === null ? undefined : driverOwed(trip) > 0 ? `${formatRupees(driverOwed(trip))} to pay` : "Settled",
      tone: "plum",
    },
    { label: "Fuel", value: formatRupees(trip.fuel), tone: "gold" },
    { label: "Repairs", value: formatRupees(trip.repairs), tone: "gold" },
    {
      label: "Profit",
      value: formatRupees(profit),
      sub:
        whenPaid !== null && whenPaid !== profit && active
          ? `${formatRupees(whenPaid)} once fully paid`
          : "Received − driver − fuel − repairs",
      tone: profit < 0 ? "red" : "green",
    },
  ];

  return (
    <main className="ap-page">
      <Link href="/admin/expenses/bookings" className="ap-link xp-back">
        <Icon name="arrow" size={15} className="xp-flip" /> All bookings
      </Link>
      <PageHeader eyebrow="Expense Tracker · Booking" title={trip.trip_no} subtitle={`${trip.customer_name} · ${routeText(trip)} · ${fmtRange(trip.start_date, trip.end_date)}`}>
        <TripBadges trip={trip} />
        {canManage && (
          <div className="ap-actions">
            {active && (
              <Link href={`/admin/expenses/bookings/${trip.trip_no}/edit`} className="ap-btn ap-btn-ghost ap-btn-sm">
                <Icon name="edit" size={14} /> Edit details
              </Link>
            )}
            <form action={changeTripStatus}>
              <input type="hidden" name="id" value={trip.id} />
              <input type="hidden" name="action" value={active ? "cancel" : "restore"} />
              <SubmitButton
                className={`ap-btn ap-btn-sm ${active ? "ap-btn-danger" : "ap-btn-gold"}`}
                confirm={active ? `Cancel ${trip.trip_no}? The vehicle becomes free on these days. Payments and costs stay recorded.` : undefined}
              >
                <Icon name={active ? "xcircle" : "undo"} size={14} /> {active ? "Cancel booking" : "Restore booking"}
              </SubmitButton>
            </form>
          </div>
        )}
      </PageHeader>
      <Flash params={query} floating />
      {!active && <p className="ap-alert ap-alert-warn">This booking is cancelled. Restore it to change it or add payments and costs.</p>}

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
        <div className="xp-col">
          <section className="ap-panel">
            <div className="ap-panel-head">
              <h2>Booking details</h2>
            </div>
            <dl className="ap-facts xp-facts">
              <div>
                <dt>Customer</dt>
                <dd>
                  {trip.customer_name}
                  <br />
                  <a href={`tel:+91${trip.customer_phone}`}>{formatPhone(trip.customer_phone)}</a>
                </dd>
              </div>
              <div>
                <dt>Vehicle</dt>
                <dd>
                  <Link href={`/admin/expenses/fleet/${trip.vehicle_id}`}>{trip.vehicle_name}</Link>
                </dd>
              </div>
              <div>
                <dt>Driver</dt>
                <dd>
                  <Link href={`/admin/expenses/fleet/drivers/${trip.driver_id}`}>{trip.driver_name}</Link>
                  <br />
                  <a href={`tel:+91${trip.driver_phone}`}>{formatPhone(trip.driver_phone)}</a>
                </dd>
              </div>
              <div>
                <dt>Dates</dt>
                <dd>
                  {fmtRange(trip.start_date, trip.end_date)}
                  <br />
                  <span className="ap-muted">{daysText(days)}</span>
                </dd>
              </div>
              <div>
                <dt>Pickup</dt>
                <dd>{placeText(trip.pickup_city, trip.pickup_state)}</dd>
              </div>
              {trip.round_trip ? (
                <div>
                  <dt>Round trip to</dt>
                  <dd>
                    {placeText(trip.dest_city, trip.dest_state)}
                    <br />
                    <span className="ap-muted">and back to {trip.pickup_city}</span>
                  </dd>
                </div>
              ) : (
                <div>
                  <dt>Drop</dt>
                  <dd>{placeText(trip.drop_city, trip.drop_state)}</dd>
                </div>
              )}
              <div>
                <dt>Referred by</dt>
                <dd>
                  {trip.referrer_name ? (
                    <>
                      {trip.referrer_name}
                      {trip.referrer_phone && (
                        <>
                          <br />
                          <a href={`tel:+91${trip.referrer_phone}`}>{formatPhone(trip.referrer_phone)}</a>
                        </>
                      )}
                    </>
                  ) : (
                    <span className="ap-muted">—</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Distance</dt>
                <dd>
                  {km !== null ? `${formatNumber(km)} km` : <span className="ap-muted">Not entered</span>}
                  {trip.odometer_start !== null && (
                    <>
                      <br />
                      <span className="ap-muted">
                        {formatNumber(trip.odometer_start)} → {trip.odometer_end !== null ? formatNumber(trip.odometer_end) : "…"}
                      </span>
                    </>
                  )}
                </dd>
              </div>
              {trip.notes && (
                <div className="ap-wide xp-notes">
                  <dt>Notes</dt>
                  <dd>{trip.notes}</dd>
                </div>
              )}
            </dl>
            <p className="xp-meta">
              Created by <strong>{trip.created_by ?? "—"}</strong> · {trip.created_ist}
              {trip.updated_ist && (
                <>
                  {" "}
                  · Last changed by <strong>{trip.updated_by ?? "—"}</strong> · {trip.updated_ist}
                </>
              )}
            </p>
          </section>

          {editable && (
            <section className="ap-panel" id="readings">
              <div className="ap-panel-head">
                <h2>Readings and amounts</h2>
              </div>
              <form action={saveReadings} className="xp-readings">
                <input type="hidden" name="id" value={trip.id} />
                <label className="ap-field">
                  <span>Odometer at start (km)</span>
                  <input type="number" name="odometer_start" inputMode="numeric" min="0" max="9999999" step="1" defaultValue={trip.odometer_start ?? ""} />
                </label>
                <label className="ap-field">
                  <span>Odometer at end (km)</span>
                  <input type="number" name="odometer_end" inputMode="numeric" min="0" max="9999999" step="1" defaultValue={trip.odometer_end ?? ""} />
                </label>
                <label className="ap-field">
                  <span>Total from customer (₹)</span>
                  <input type="number" name="total_amount" inputMode="decimal" min="0" max="10000000" step="0.01" defaultValue={trip.total_amount ?? ""} />
                </label>
                <label className="ap-field">
                  <span>Amount for the driver (₹)</span>
                  <input type="number" name="driver_amount" inputMode="decimal" min="0" max="10000000" step="0.01" defaultValue={trip.driver_amount ?? ""} />
                </label>
                <SubmitButton className="ap-btn ap-btn-gold">
                  <Icon name="check" size={15} /> Save
                </SubmitButton>
              </form>
              <p className="ap-hint">Km travelled is worked out from the two odometer readings.</p>
            </section>
          )}
        </div>

        <div className="xp-col">
          <Payments
            party="customer"
            trip={trip}
            payments={payments.filter((p) => p.party === "customer")}
            due={trip.total_amount}
            paid={trip.received}
            canManage={canManage}
            now={nowLocalIST()}
          />
          <Payments
            party="driver"
            trip={trip}
            payments={payments.filter((p) => p.party === "driver")}
            due={trip.driver_amount}
            paid={trip.driver_paid}
            canManage={canManage}
            now={nowLocalIST()}
          />
        </div>
      </div>

      <div className="xp-detail">
        <Expenses
          kind="fuel"
          entries={expenses.filter((e) => e.kind === "fuel")}
          target={{ tripId: trip.id, vehicleId: trip.vehicle_id }}
          canManage={canManage}
          canAdd={active}
          today={todayIST()}
        />
        <Expenses
          kind="repair"
          entries={expenses.filter((e) => e.kind === "repair")}
          target={{ tripId: trip.id, vehicleId: trip.vehicle_id }}
          canManage={canManage}
          canAdd={active}
          today={todayIST()}
        />
      </div>

      {history && (
        <section className="ap-panel xp-history" id="history">
          <div className="ap-panel-head">
            <h2>History</h2>
            <span className="ap-muted">Everything done on this booking, newest first</span>
          </div>
          {history.length === 0 ? (
            <p className="ap-empty-sm">Nothing recorded yet.</p>
          ) : (
            <ul className="ap-acts">
              {[...history].reverse().map((row) => (
                <ActivityEntry key={row.id} row={{ ...row, time: row.at_ist }} linkTargets={false} />
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
