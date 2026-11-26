import Link from "next/link";
import Icon from "@/components/admin/Icon";
import { daysText, diffDays, fmtRange, monthShort } from "@/lib/dates";
import { formatNumber, formatRupees } from "@/lib/expenses/money";
import {
  balanceOf,
  driverOwed,
  kmOf,
  PAY_LABELS,
  payableOf,
  payState,
  PHASE_LABELS,
  routeText,
  type Trip,
} from "@/lib/expenses/trips";
import { formatPhone } from "@/lib/format";

/** "Upcoming" / "On trip" / … and "Paid" / "Partly paid" / "Payment due" */
export function TripBadges({ trip }: { trip: Trip }) {
  const pay = payState(trip);
  return (
    <span className="xp-badges">
      <span className={`ap-badge xp-phase is-${trip.phase}`}>{PHASE_LABELS[trip.phase]}</span>
      {trip.status === "booked" && <span className={`ap-badge xp-pay is-${pay}`}>{PAY_LABELS[pay]}</span>}
      {trip.is_sample && <span className="ap-badge is-sample">Sample</span>}
    </span>
  );
}

/** A booking in the list; the whole card opens the booking (phone numbers and buttons still work on their own) */
export default function TripCard({ trip }: { trip: Trip }) {
  const href = `/admin/expenses/bookings/${trip.trip_no}`;
  const km = kmOf(trip);
  const balance = balanceOf(trip);
  const owed = driverOwed(trip);
  const payable = payableOf(trip);
  return (
    <article className={`ap-card xp-trip is-${trip.phase}`}>
      {/* Phones only (admin-mobile.css): the start date as a tile, in place of the dates line below */}
      <span className="xp-datetile">
        <b>{trip.start_date.slice(8)}</b>
        <span>{monthShort(trip.start_date)}</span>
        <small>{daysText(diffDays(trip.start_date, trip.end_date) + 1)}</small>
      </span>
      <div className="ap-card-head">
        <div className="ap-card-title">
          {/* Stretched over the whole card, so clicking anywhere on it opens the booking */}
          <Link href={href} className="ap-ref xp-tripno xp-cardlink">
            {trip.trip_no}
          </Link>
          <TripBadges trip={trip} />
        </div>
        <span className="xp-dates">
          <Icon name="calendar" size={14} /> {fmtRange(trip.start_date, trip.end_date)} · {daysText(diffDays(trip.start_date, trip.end_date) + 1)}
        </span>
      </div>
      <div className="ap-customer">
        <strong>{trip.customer_name}</strong>
        <a href={`tel:+91${trip.customer_phone}`}>{formatPhone(trip.customer_phone)}</a>
      </div>
      <dl className="ap-facts xp-cardfacts">
        <div>
          <dt>Vehicle · driver</dt>
          <dd>
            {trip.vehicle_name} · {trip.driver_name}
          </dd>
        </div>
        <div>
          <dt>{trip.round_trip ? "Round trip" : "Route"}</dt>
          <dd>{routeText(trip)}</dd>
        </div>
        {/* Phones hide this one and the driver's: the amount column on the right says it in short */}
        <div className="xp-fact-paid">
          <dt>Customer paid</dt>
          <dd>
            {trip.total_amount === null ? (
              <>{formatRupees(trip.received)} · total not set</>
            ) : (
              <>
                {/* Of what they pay: the total less any discount */}
                {formatRupees(trip.received)} of {formatRupees(payableOf(trip) ?? trip.total_amount)}
                {trip.discount !== null && <span className="ap-muted"> ({formatRupees(trip.discount)} off)</span>}
                {balance > 0 && trip.status === "booked" && <b className="xp-owed"> · {formatRupees(balance)} due</b>}
              </>
            )}
          </dd>
        </div>
        <div className="xp-fact-driver">
          {/* "km" only once the odometer readings give a distance */}
          <dt>{km !== null ? "Driver · km" : "Driver"}</dt>
          <dd>
            {trip.driver_amount === null ? "Amount not set" : owed > 0 ? <b className="xp-owed">{formatRupees(owed)} to pay</b> : "Driver settled"}
            {km !== null && <> · {formatNumber(km)} km</>}
          </dd>
        </div>
      </dl>
      <div className="ap-card-foot">
        <span className="ap-by">
          Created by <strong>{trip.created_by ?? "—"}</strong> · {trip.created_ist}
        </span>
        <Link href={href} className="ap-btn ap-btn-ghost ap-btn-sm">
          Open booking <Icon name="arrow" size={14} />
        </Link>
      </div>
      {/* Phones only: the money in short, on the right. What the customer still owes (or that it's paid),
          and what the driver is still owed */}
      {trip.status === "booked" && (
        <span className="xp-tripamt">
          {payable === null ? (
            <span className="ap-badge xp-pay is-unset">No total</span>
          ) : balance > 0 ? (
            <>
              <strong className="is-due">{formatRupees(balance)}</strong>
              <small>due</small>
            </>
          ) : (
            <>
              <strong>{formatRupees(payable)}</strong>
              <small>paid</small>
            </>
          )}
          {owed > 0 && <small className="is-driver">driver {formatRupees(owed)}</small>}
        </span>
      )}
    </article>
  );
}
