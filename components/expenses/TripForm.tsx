"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, startTransition } from "react";
import { saveTrip, type TripFormState } from "@/app/admin/expenses/bookings/actions";
import Icon from "@/components/admin/Icon";
import Dropdown from "@/components/Dropdown";
import MobileInput from "@/components/MobileInput";
import { PAYMENT_METHODS } from "@/lib/expenses/money";
import PlacePicker from "./PlacePicker";

export type TripFormValues = {
  vehicle_id: string;
  driver_id: string;
  customer_name: string;
  customer_phone: string;
  start_date: string;
  end_date: string;
  pickup_state: string;
  pickup_city: string;
  drop_state: string;
  drop_city: string;
  round_trip: boolean;
  dest_state: string;
  dest_city: string;
  referrer_name: string;
  referrer_phone: string;
  notes: string;
  odometer_start: string;
  total_amount: string;
  advance_amount: string;
  advance_method: string;
  driver_amount: string;
};

export const EMPTY_TRIP: TripFormValues = {
  vehicle_id: "",
  driver_id: "",
  customer_name: "",
  customer_phone: "",
  start_date: "",
  end_date: "",
  pickup_state: "",
  pickup_city: "",
  drop_state: "",
  drop_city: "",
  round_trip: false,
  dest_state: "",
  dest_city: "",
  referrer_name: "",
  referrer_phone: "",
  notes: "",
  odometer_start: "",
  total_amount: "",
  advance_amount: "",
  advance_method: "cash",
  driver_amount: "",
};

type Props = {
  /** Editing an existing booking */
  tripId?: number;
  initial: TripFormValues;
  vehicles: { id: number; name: string; active: boolean }[];
  drivers: { id: number; name: string; phone: string; active: boolean }[];
  cancelHref: string;
};

const dayCount = (start: string, end: string) =>
  start && end && end >= start ? Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1 : 0;

export default function TripForm({ tripId, initial, vehicles, drivers, cancelHref }: Props) {
  const isNew = tripId === undefined;
  const [v, setV] = useState<TripFormValues>(initial);
  const [state, formAction, pending] = useActionState<TripFormState, FormData>(saveTrip, {});
  const form = useRef<HTMLFormElement>(null);
  const alert = useRef<HTMLDivElement>(null);
  const set = <K extends keyof TripFormValues>(key: K, value: TripFormValues[K]) => setV((old) => ({ ...old, [key]: value }));

  // Switched-off vehicles and drivers only appear when this booking already uses them
  const vehicleChoices = vehicles.filter((x) => x.active || String(x.id) === initial.vehicle_id);
  const driverChoices = drivers.filter((x) => x.active || String(x.id) === initial.driver_id);
  const days = dayCount(v.start_date, v.end_date);
  const off = (active: boolean) => (active ? "" : " (switched off)");
  const vehicleOptions = vehicleChoices.map((x) => ({ value: String(x.id), label: x.name + off(x.active) }));
  const driverOptions = driverChoices.map((x) => ({
    value: String(x.id),
    label: `${x.name} · ${x.phone.slice(0, 5)} ${x.phone.slice(5)}${off(x.active)}`,
  }));
  const methodOptions = Object.entries(PAYMENT_METHODS).map(([value, label]) => ({ value, label }));
  // A field to put the cursor in (dropdowns: their visible box, not the hidden value)
  const fieldEl = (name: string) =>
    form.current?.querySelector<HTMLElement>(`[data-for="${name}"]`) ?? (form.current?.elements.namedItem(name) as HTMLElement | null);

  // After a server error: show it and put the cursor in the field it's about
  useEffect(() => {
    if (!state.error && !state.driverClash) return;
    const field = state.field && fieldEl(state.field);
    if (field instanceof HTMLElement) {
      field.focus();
      field.scrollIntoView({ block: "center", behavior: "smooth" });
    } else {
      alert.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [state]);

  function submit(allowDriverClash = false) {
    if (!form.current) return;
    const data = new FormData(form.current);
    if (allowDriverClash) data.set("allow_driver_clash", "1");
    startTransition(() => formAction(data));
  }

  if (vehicleChoices.length === 0 || driverChoices.length === 0) {
    return (
      <section className="ap-panel">
        <div className="ap-empty">
          <Icon name="car" size={32} />
          <p>
            {vehicleChoices.length === 0 && driverChoices.length === 0
              ? "Add a vehicle and a driver first."
              : vehicleChoices.length === 0
                ? "Add a vehicle first."
                : "Add a driver first."}{" "}
            Bookings need both.
          </p>
          <Link href="/admin/expenses/fleet" className="ap-btn ap-btn-gold">
            <Icon name="plus" size={15} /> Add vehicles & drivers
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form
      ref={form}
      className="xp-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {tripId !== undefined && <input type="hidden" name="id" value={tripId} />}

      <div ref={alert} aria-live="polite">
        {state.error && <p className="ap-alert ap-alert-error">{state.error}</p>}
        {state.driverClash && !pending && (
          <div className="ap-alert ap-alert-warn xp-clash">
            <p>
              <strong>Driver already busy.</strong> {state.driverClash} Save this booking anyway?
            </p>
            <div className="ap-actions">
              <button
                type="button"
                className="ap-btn ap-btn-ghost ap-btn-sm"
                onClick={() => fieldEl("driver_id")?.focus()}
              >
                Change driver
              </button>
              <button type="button" className="ap-btn ap-btn-gold ap-btn-sm" onClick={() => submit(true)}>
                Save anyway
              </button>
            </div>
          </div>
        )}
      </div>

      <section className="ap-panel xp-section">
        <h2>
          <Icon name="users" size={18} /> Customer
        </h2>
        <div className="xp-grid">
          <label className="ap-field">
            <span>Customer name</span>
            <input
              name="customer_name"
              required
              minLength={2}
              maxLength={60}
              autoComplete="off"
              placeholder="e.g. Ravi Kumar"
              value={v.customer_name}
              onChange={(e) => set("customer_name", e.target.value)}
            />
          </label>
          <label className="ap-field">
            <span>Customer mobile number</span>
            <MobileInput
              name="customer_phone"
              required
              autoComplete="off"
              value={v.customer_phone}
              onChange={(phone) => set("customer_phone", phone)}
            />
          </label>
        </div>
      </section>

      <section className="ap-panel xp-section">
        <h2>
          <Icon name="car" size={18} /> Vehicle, driver and dates
        </h2>
        <div className="xp-grid">
          <label className="ap-field">
            <span>Vehicle</span>
            <Dropdown
              name="vehicle_id"
              options={vehicleOptions}
              required
              placeholder="Select vehicle"
              requiredMessage="Choose the vehicle."
              value={v.vehicle_id}
              onChange={(id) => set("vehicle_id", id)}
            />
          </label>
          <label className="ap-field">
            <span>Driver</span>
            <Dropdown
              name="driver_id"
              options={driverOptions}
              required
              placeholder="Select driver"
              requiredMessage="Choose the driver."
              value={v.driver_id}
              onChange={(id) => set("driver_id", id)}
            />
          </label>
          <label className="ap-field">
            <span>Start date</span>
            <input
              type="date"
              name="start_date"
              required
              min="2020-01-01"
              max="2099-12-31"
              value={v.start_date}
              onChange={(e) => {
                const start = e.target.value;
                // Keep the end date on or after the start
                setV((old) => ({ ...old, start_date: start, end_date: !old.end_date || old.end_date < start ? start : old.end_date }));
              }}
            />
          </label>
          <label className="ap-field">
            <span>End date</span>
            <input
              type="date"
              name="end_date"
              required
              min={v.start_date || "2020-01-01"}
              max="2099-12-31"
              value={v.end_date}
              onChange={(e) => set("end_date", e.target.value)}
            />
            <span className="mob-msg">{days ? `${days} day${days === 1 ? "" : "s"}` : ""}</span>
          </label>
        </div>
      </section>

      <section className="ap-panel xp-section">
        <h2>
          <Icon name="route" size={18} /> Route
        </h2>
        <PlacePicker
          label="Pickup"
          stateName="pickup_state"
          cityName="pickup_city"
          required
          value={{ state: v.pickup_state, city: v.pickup_city }}
          onChange={(p) => setV((old) => ({ ...old, pickup_state: p.state, pickup_city: p.city }))}
        />

        <label className="xp-switch">
          <input
            type="checkbox"
            name="round_trip"
            value="1"
            checked={v.round_trip}
            onChange={(e) => set("round_trip", e.target.checked)}
          />
          <span className="xp-switch-track" aria-hidden="true" />
          <span>
            <strong>Round trip</strong>
            <small>The vehicle comes back to the pickup city</small>
          </span>
        </label>

        {v.round_trip ? (
          <>
            <p className="xp-subhead">Where did it go?</p>
            <PlacePicker
              label="Destination"
              stateName="dest_state"
              cityName="dest_city"
              required
              cityPlaceholder="Search or type the place"
              value={{ state: v.dest_state, city: v.dest_city }}
              onChange={(p) => setV((old) => ({ ...old, dest_state: p.state, dest_city: p.city }))}
            />
            <p className="ap-hint xp-backto">
              <Icon name="undo" size={14} /> Drop: back to {v.pickup_city || "the pickup city"}
            </p>
          </>
        ) : (
          <>
            <p className="xp-subhead">Drop</p>
            <PlacePicker
              label="Drop"
              stateName="drop_state"
              cityName="drop_city"
              required
              value={{ state: v.drop_state, city: v.drop_city }}
              onChange={(p) => setV((old) => ({ ...old, drop_state: p.state, drop_city: p.city }))}
            />
          </>
        )}
      </section>

      <section className="ap-panel xp-section">
        <h2>
          <Icon name="userplus" size={18} /> Referred by <small>optional</small>
        </h2>
        <div className="xp-grid">
          <label className="ap-field">
            <span>Name</span>
            <input
              name="referrer_name"
              maxLength={60}
              autoComplete="off"
              placeholder="Who sent this customer to us"
              required={Boolean(v.referrer_phone)}
              value={v.referrer_name}
              onChange={(e) => set("referrer_name", e.target.value)}
            />
          </label>
          <label className="ap-field">
            <span>Mobile number</span>
            <MobileInput
              name="referrer_phone"
              autoComplete="off"
              placeholder="10-digit number (optional)"
              value={v.referrer_phone}
              onChange={(phone) => set("referrer_phone", phone)}
            />
          </label>
        </div>
      </section>

      {isNew && (
        <section className="ap-panel xp-section">
          <h2>
            <Icon name="rupee" size={18} /> Money and odometer <small>optional, can be filled in later</small>
          </h2>
          <div className="xp-grid xp-grid-4">
            <label className="ap-field">
              <span>Total to collect from customer (₹)</span>
              <input
                type="number"
                name="total_amount"
                inputMode="decimal"
                min="0"
                max="10000000"
                step="0.01"
                placeholder="e.g. 12000"
                value={v.total_amount}
                onChange={(e) => set("total_amount", e.target.value)}
              />
            </label>
            <label className="ap-field">
              <span>Advance paid by customer (₹)</span>
              <input
                type="number"
                name="advance_amount"
                inputMode="decimal"
                min="0.01"
                max={v.total_amount || "10000000"}
                step="0.01"
                placeholder="e.g. 2000"
                value={v.advance_amount}
                onChange={(e) => set("advance_amount", e.target.value)}
              />
            </label>
            <label className="ap-field">
              <span>Advance paid by</span>
              <Dropdown
                name="advance_method"
                options={methodOptions}
                value={v.advance_method}
                onChange={(method) => set("advance_method", method)}
              />
            </label>
            <label className="ap-field">
              <span>Amount for the driver (₹)</span>
              <input
                type="number"
                name="driver_amount"
                inputMode="decimal"
                min="0"
                max="10000000"
                step="0.01"
                placeholder="e.g. 1500"
                value={v.driver_amount}
                onChange={(e) => set("driver_amount", e.target.value)}
              />
            </label>
            <label className="ap-field">
              <span>Odometer at start (km)</span>
              <input
                type="number"
                name="odometer_start"
                inputMode="numeric"
                min="0"
                max="9999999"
                step="1"
                placeholder="e.g. 45120"
                value={v.odometer_start}
                onChange={(e) => set("odometer_start", e.target.value)}
              />
            </label>
          </div>
        </section>
      )}

      <section className="ap-panel xp-section">
        <h2>
          <Icon name="file" size={18} /> Notes <small>optional</small>
        </h2>
        <label className="ap-field">
          <span className="sr-only">Notes</span>
          <textarea
            name="notes"
            rows={3}
            maxLength={500}
            placeholder="Anything else to remember about this booking"
            value={v.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </label>
      </section>

      <div className="xp-formbar">
        <Link href={cancelHref} className="ap-btn ap-btn-ghost">
          Cancel
        </Link>
        <button type="submit" className="ap-btn ap-btn-gold" disabled={pending}>
          {pending ? "Saving…" : isNew ? (
            <>
              <Icon name="check" size={16} /> Create booking
            </>
          ) : (
            <>
              <Icon name="check" size={16} /> Save changes
            </>
          )}
        </button>
      </div>
    </form>
  );
}
