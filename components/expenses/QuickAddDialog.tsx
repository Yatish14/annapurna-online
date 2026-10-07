"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { quickAddDriver, quickAddVehicle } from "@/app/admin/expenses/fleet/actions";
import Icon from "@/components/admin/Icon";
import MobileInput from "@/components/MobileInput";

export type VehicleChoice = { id: number; name: string; active: boolean };
export type DriverChoice = { id: number; name: string; phone: string; active: boolean };

type Props =
  | { kind: "vehicle"; onAdded: (vehicle: VehicleChoice) => void; onClose: () => void }
  | { kind: "driver"; onAdded: (driver: DriverChoice) => void; onClose: () => void };

/**
 * A small window over the booking form for adding a vehicle or driver without leaving the form.
 * The new one is added to the dropdown and chosen; Escape or Cancel closes it.
 */
export default function QuickAddDialog(props: Props) {
  const { kind, onClose } = props;
  const isVehicle = kind === "vehicle";
  const [error, setError] = useState<{ text: string; field: "name" | "phone" } | null>(null);
  const [saving, setSaving] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Where the cursor was (the "+ New …" button), read before the name box takes it
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  // Escape closes; Tab stays inside the window; the cursor goes back where it was afterwards
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
      } else if (e.key === "Tab" && box.current) {
        const items = Array.from(box.current.querySelectorAll<HTMLElement>("input:not([type=hidden]), button:not(:disabled)"));
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [opener]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation(); // not a submit of the booking form
    const form = e.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    setError(null);
    try {
      const result = props.kind === "vehicle" ? await quickAddVehicle(data) : await quickAddDriver(data);
      if (result.ok) {
        if (props.kind === "vehicle") props.onAdded(result.item as VehicleChoice);
        else props.onAdded(result.item as DriverChoice);
        onClose();
        return;
      }
      setError({ text: result.error, field: result.field });
      form.querySelector<HTMLElement>(result.field === "phone" ? "input[name=phone]" : "input[name=name]")?.focus();
    } catch {
      setError({ text: "Couldn't save. Check the internet connection and try again.", field: "name" });
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="xp-modal-backdrop">
      <div ref={box} className="xp-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <form onSubmit={submit}>
          <h2 id={titleId}>
            <Icon name={isVehicle ? "car" : "steering"} size={20} /> New {kind}
          </h2>
          <p className="xp-modal-note">
            {isVehicle
              ? "It's added to the list and chosen for this booking. Loan and insurance details can be added later on the vehicle's page."
              : "They're added to the list and chosen for this booking."}
          </p>
          <label className="ap-field">
            <span>{isVehicle ? "Vehicle name" : "Driver name"}</span>
            <input
              name="name"
              required
              minLength={2}
              maxLength={60}
              autoFocus
              autoComplete="off"
              placeholder={isVehicle ? "e.g. Kia Seltos" : "e.g. Venkatesh"}
              aria-invalid={error?.field === "name" || undefined}
              className={error?.field === "name" ? "is-invalid" : undefined}
            />
          </label>
          {!isVehicle && (
            <label className="ap-field">
              <span>Mobile number</span>
              <MobileInput name="phone" required autoComplete="off" />
            </label>
          )}
          <div aria-live="polite">{error && <p className="ap-alert ap-alert-error">{error.text}</p>}</div>
          <div className="xp-modal-actions">
            <button type="button" className="ap-btn ap-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="ap-btn ap-btn-gold" disabled={saving}>
              {saving ? (
                "Adding…"
              ) : (
                <>
                  <Icon name="plus" size={15} /> Add {kind}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
