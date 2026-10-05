import { resendMessage, updateBooking } from "@/app/admin/actions";
import { STATUS_TABS } from "@/app/admin/filters";
import type { Booking } from "@/lib/bookings";
import { CARS, passengersText } from "@/lib/config";
import { daysText, diffDays, fmtRange } from "@/lib/dates";
import { formatPhone } from "@/lib/format";
import Icon from "./Icon";
import SubmitButton from "./SubmitButton";

/** Turns a shared-location map link into a clickable link */
function PickupText({ text }: { text: string }) {
  const parts = text.split(/(https:\/\/maps\.google\.com\/\?q=[\d.,-]+)/);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("https://maps.google.com/") ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer">
            open map
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

function ActionForm({
  booking,
  action,
  back,
  children,
  className,
  confirm,
  disabled,
  title,
}: {
  booking: Booking;
  action: "book" | "reject" | "cancel" | "resend";
  back: string;
  children: React.ReactNode;
  className: string;
  confirm?: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <form action={action === "resend" ? resendMessage : updateBooking}>
      <input type="hidden" name="id" value={booking.id} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="back" value={back} />
      <SubmitButton className={className} confirm={confirm} disabled={disabled} title={title}>
        {children}
      </SubmitButton>
    </form>
  );
}

type Props = {
  b: Booking;
  today: string;
  /** Dashboard URL to come back to after an action */
  back: string;
  /** Show the action buttons (admins); viewers only see the details */
  canManage: boolean;
  /** Refs of confirmed bookings this pending enquiry overlaps */
  conflict?: string;
};

export default function BookingCard({ b, today, back, canManage, conflict }: Props) {
  const days = diffDays(b.start_date, b.end_date) + 1;
  const datesPassed = b.start_date < today;
  const statusLabel = STATUS_TABS.find((t) => t.id === b.status)?.label ?? b.status;

  return (
    <article className={`ad-card is-${b.status}`}>
      <div className="ad-card-head">
        <div className="ad-card-title">
          <span className="ad-ref">{b.ref}</span>
          <span className={`ad-badge is-${b.status}`}>{statusLabel}</span>
          {b.is_sample && <span className="ad-badge is-sample">Test data</span>}
        </div>
        <div className="ad-customer">
          <strong>{b.customer_name || "WhatsApp customer"}</strong>
          <a href={`https://wa.me/${b.phone.length === 10 ? `91${b.phone}` : b.phone}`} target="_blank" rel="noopener noreferrer">
            {formatPhone(b.phone)}
          </a>
        </div>
      </div>

      <dl className="ad-facts">
        <div>
          <dt>Car</dt>
          <dd>{CARS[b.car].name}</dd>
        </div>
        <div>
          <dt>Passengers</dt>
          <dd>{passengersText(b.adults, b.children)}</dd>
        </div>
        <div>
          <dt>Dates</dt>
          <dd>
            {fmtRange(b.start_date, b.end_date)} <span className="ad-muted">· {daysText(days)}</span>
          </dd>
        </div>
        <div className="ad-wide">
          <dt>Pickup</dt>
          <dd>
            <PickupText text={b.pickup_location} />
          </dd>
        </div>
        <div>
          <dt>Received</dt>
          <dd>{b.created_ist}</dd>
        </div>
      </dl>

      {b.status === "pending" && conflict && (
        <p className="ad-note ad-note-error">
          ⚠ Dates overlap confirmed booking {conflict}. Reject this enquiry or cancel the other booking first.
        </p>
      )}
      {b.status === "pending" && datesPassed && <p className="ad-note ad-note-warn">The start date has already passed.</p>}
      {(b.status === "confirmed" || b.status === "rejected") &&
        (b.is_sample ? (
          <p className="ad-note ad-note-warn">Test data: no WhatsApp message is sent for sample bookings.</p>
        ) : b.notify_error ? (
          <p className="ad-note ad-note-error">WhatsApp message failed: {b.notify_error}</p>
        ) : b.notified ? (
          <p className="ad-note ad-note-ok">✓ Customer notified on WhatsApp</p>
        ) : null)}

      <div className="ad-card-foot">
        {b.updated_by && b.status !== "pending" ? (
          <span className="ad-by">
            <Icon name="shield" size={14} /> {statusLabel} by <strong>{b.updated_by}</strong> · {b.updated_ist}
          </span>
        ) : (
          <span />
        )}

        {canManage && (
          <div className="ad-actions">
            {b.status === "pending" && (
              <>
                <ActionForm
                  booking={b}
                  action="reject"
                  back={back}
                  className="ad-btn ad-btn-ghost"
                  confirm={`Reject ${b.ref}? The customer will be told the car isn't available.`}
                >
                  Reject
                </ActionForm>
                <ActionForm
                  booking={b}
                  action="book"
                  back={back}
                  className="ad-btn ad-btn-gold"
                  disabled={Boolean(conflict) || datesPassed}
                  title={conflict ? "Dates overlap a confirmed booking" : datesPassed ? "Start date has passed" : undefined}
                >
                  ✓ Mark as Booked
                </ActionForm>
              </>
            )}
            {(b.status === "confirmed" || b.status === "rejected") && b.notify_error && !b.is_sample && (
              <ActionForm booking={b} action="resend" back={back} className="ad-btn ad-btn-ghost">
                Resend message
              </ActionForm>
            )}
            {b.status === "confirmed" && b.end_date >= today && (
              <ActionForm
                booking={b}
                action="cancel"
                back={back}
                className="ad-btn ad-btn-danger"
                confirm={`Cancel booking ${b.ref}? Its dates become free again. The customer is NOT messaged, so please call them.`}
              >
                Cancel booking
              </ActionForm>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
