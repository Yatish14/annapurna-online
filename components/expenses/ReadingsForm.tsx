"use client";

import { useRef, useState } from "react";
import { saveReadings } from "@/app/admin/expenses/bookings/actions";
import Icon from "@/components/admin/Icon";
import SubmitButton from "@/components/admin/SubmitButton";

type Props = {
  tripId: number;
  odometerStart: number | null;
  odometerEnd: number | null;
  kmDirect: number | null;
  totalAmount: number | null;
  driverAmount: number | null;
};

/**
 * The booking's km and agreed amounts. Km comes from the two odometer readings, or (switch on) is typed
 * in directly when the odometer wasn't noted. Saving one way clears the other.
 */
export default function ReadingsForm({ tripId, odometerStart, odometerEnd, kmDirect, totalAmount, driverAmount }: Props) {
  const [direct, setDirect] = useState(kmDirect !== null && odometerStart === null);
  const hasReadings = odometerStart !== null || odometerEnd !== null;
  const form = useRef<HTMLFormElement>(null);

  // Flipping the switch puts the cursor in the first box of the other way
  function toggle(on: boolean) {
    setDirect(on);
    window.setTimeout(() => form.current?.querySelector<HTMLInputElement>(on ? "[name=km_direct]" : "[name=odometer_start]")?.focus(), 0);
  }

  return (
    <>
      <form ref={form} action={saveReadings} className="xp-readings">
        <input type="hidden" name="id" value={tripId} />
        <input type="hidden" name="km_mode" value={direct ? "direct" : "odometer"} />
        <label className="xp-switch xp-kmswitch">
          <input type="checkbox" checked={direct} onChange={(e) => toggle(e.target.checked)} />
          <span className="xp-switch-track" aria-hidden="true" />
          <span>
            <strong>Enter km directly</strong>
            <small>Instead of the odometer readings at the start and end</small>
          </span>
        </label>
        {direct ? (
          <label className="ap-field xp-kmfield">
            <span>Km travelled</span>
            <input type="number" name="km_direct" inputMode="numeric" min="0" max="999999" step="1" placeholder="e.g. 340" defaultValue={kmDirect ?? ""} />
          </label>
        ) : (
          <>
            <label className="ap-field">
              <span>Odometer at start (km)</span>
              <input type="number" name="odometer_start" inputMode="numeric" min="0" max="9999999" step="1" defaultValue={odometerStart ?? ""} />
            </label>
            <label className="ap-field">
              <span>Odometer at end (km)</span>
              <input type="number" name="odometer_end" inputMode="numeric" min="0" max="9999999" step="1" defaultValue={odometerEnd ?? ""} />
            </label>
          </>
        )}
        <label className="ap-field">
          <span>Total from customer (₹)</span>
          <input type="number" name="total_amount" inputMode="decimal" min="0" max="10000000" step="0.01" defaultValue={totalAmount ?? ""} />
        </label>
        <label className="ap-field">
          <span>Amount for the driver (₹)</span>
          <input type="number" name="driver_amount" inputMode="decimal" min="0" max="10000000" step="0.01" defaultValue={driverAmount ?? ""} />
        </label>
        <SubmitButton className="ap-btn ap-btn-gold">
          <Icon name="check" size={15} /> Save
        </SubmitButton>
      </form>
      <p className="ap-hint">
        {direct
          ? hasReadings
            ? "Saving replaces the odometer readings on this booking with the km entered."
            : "Use this when the odometer wasn't noted."
          : kmDirect !== null
            ? "Saving with odometer readings replaces the km entered earlier."
            : "Km travelled is worked out from the two odometer readings."}
      </p>
    </>
  );
}
