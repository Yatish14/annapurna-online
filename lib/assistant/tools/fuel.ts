import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { fmtShort, isIsoDate, todayIST } from "@/lib/dates";
import { fleetChoices } from "@/lib/expenses/fleet";
import { FUEL_PROBLEMS, parseFuel } from "@/lib/expenses/fuelInput";
import { formatRupees } from "@/lib/expenses/money";
import { fromObject } from "@/lib/expenses/tripInput";
import { draftOwner, saveDraft } from "../draftStore";
import { matchName } from "../match";
import { findBooking } from "./findBooking";
import { freeText, toolReply } from "./result";

/**
 * draft_fuel: prepares a fuel fill, on a booking (its vehicle is used) or straight on a vehicle, and checks it with
 * exactly the fuel form's rules (parseFuel, lib/expenses/fuelInput.ts). It SAVES NO FUEL: like the other drafts, a
 * ready one is kept on the server for the admin who asked and saved only by their Confirm (4.10).
 */

/** A price per litre outside this is probably a typo in the amount or the litres (diesel and petrol are ~₹90–110) */
const LITRE_PRICE = { low: 70, high: 130 };

const ask = (note: string, extra: object = {}) => toolReply({ status: "failed", data: { ready: false, ...extra }, note });

export const draftFuel = tool(
  async (a, config) => {
    // 0. What it's for (a booking, or a vehicle) and everything missing, asked at once
    const trip = a.booking ? await findBooking(a.booking) : null;
    const unclearTrip = trip && !("id" in trip) ? trip : null;
    const { vehicles } = await fleetChoices();
    const inUse = vehicles.filter((v) => v.active);
    const vehicleMatch = a.vehicle ? matchName(a.vehicle, inUse) : null;
    const unclearVehicle =
      vehicleMatch && !vehicleMatch.found
        ? vehicleMatch.candidates.length
          ? { why: `"${a.vehicle}" could be more than one vehicle.`, choices: vehicleMatch.candidates.map((v) => freeText(v.name, 60) ?? "") }
          : { why: `No vehicle in use is called "${a.vehicle}".`, choices: inUse.map((v) => freeText(v.name, 60) ?? "") }
        : null;
    const missing = [!a.booking && !a.vehicle && "which booking or vehicle", !a.amount && "the amount"].filter(Boolean);
    const questions = [
      unclearTrip && { about: "booking", ...unclearTrip },
      unclearVehicle && { about: "vehicle", ...unclearVehicle },
    ].filter(Boolean);
    if (missing.length || questions.length) {
      return ask(
        [questions.length && "Ask which, listing the choices; never choose for the admin.",
          missing.length && `Still needed: ${missing.join(", ")}.`,
          "Ask the admin all of this in one short question; never fill anything in yourself."].filter(Boolean).join(" "),
        questions.length ? { ask_about: questions } : { missing: "several" },
      );
    }
    const booking = trip && "id" in trip ? trip : null;
    const vehicle = vehicleMatch?.found ?? null;
    if (booking?.status === "cancelled") return ask(`${booking.trip_no} is cancelled, so fuel can't be added to it. Tell the admin.`);
    // Both said, and they don't agree: the fill goes on the booking's vehicle, so ask which is right
    if (booking && vehicle && vehicle.id !== booking.vehicle_id) {
      return ask(`${booking.trip_no} is on the ${booking.vehicle_name}, not the ${vehicle.name}. Ask the admin which is right.`);
    }
    if (a.spent_on && a.spent_on > todayIST()) return ask("That date is in the future. Ask the admin when the fuel was filled.");

    // 1. The fill as the fuel form's fields, then the form's own checks
    const fields: Record<string, string> = {
      ...(booking ? { trip_id: String(booking.id), trip_no: booking.trip_no } : {}),
      vehicle_id: String(booking ? booking.vehicle_id : vehicle!.id),
      vehicle_name: booking ? booking.vehicle_name : vehicle!.name,
      amount: String(a.amount),
      litres: a.litres != null ? String(a.litres) : "",
      spent_on: a.spent_on ?? todayIST(),
      note: a.note ?? "",
    };
    const parsed = parseFuel(fromObject(fields));
    if (!parsed.ok) return ask(`${FUEL_PROBLEMS[parsed.problem]} (Ask the admin; never fill it in yourself.)`);
    const f = parsed.fuel;

    // 2. A price per litre that looks wrong is a warning on the card (worked out by our code)
    const perLitre = f.litres ? f.amount / f.litres : null;
    const warning =
      perLitre !== null && (perLitre < LITRE_PRICE.low || perLitre > LITRE_PRICE.high)
        ? `That's ${formatRupees(Math.round(perLitre))} a litre. Check the amount and the litres.`
        : null;

    // 3. Kept on the server for the admin who asked; the card gets only the id. No fuel is saved.
    const draftId = await saveDraft(draftOwner(config, "draft_fuel"), "fuel", fields);
    return toolReply({
      status: "found",
      data: {
        ready: true,
        fuel: {
          for: booking
            ? `${booking.trip_no} · ${freeText(booking.customer_name, 60)}`
            : `${freeText(fields.vehicle_name, 60)} (not on a booking)`,
          vehicle: freeText(fields.vehicle_name, 60),
          amount: formatRupees(f.amount),
          litres: f.litres !== null ? `${f.litres} L${perLitre !== null ? ` (${formatRupees(Math.round(perLitre * 100) / 100)} a litre)` : ""}` : "not given",
          when: f.spentOn === todayIST() ? "Today" : fmtShort(f.spentOn),
          note: freeText(f.note, 200),
        },
        warning,
        draft_id: draftId,
        // Where the fuel shows once saved: the booking's page, or the vehicle's (for the card's link)
        page: booking ? `/admin/expenses/bookings/${booking.trip_no}#fuel` : `/admin/expenses/fleet/${fields.vehicle_id}#fuel`,
      },
      note:
        "Checked with the fuel form's rules. NO FUEL IS SAVED. The admin sees these details on a card under your " +
        "answer, with a Confirm button; only their Confirm saves it, you can't.",
    });
  },
  {
    name: "draft_fuel",
    description:
      "Prepares a fuel fill: on a booking (it goes on that booking's vehicle) or straight on a vehicle when it isn't " +
      "for a booking. Checks it with the fuel form's rules. It saves nothing: it says what's missing or unclear, or " +
      "returns the fill ready for the admin to check and confirm. Call it again with the answers.",
    schema: z.object({
      booking: z
        .string()
        .max(80)
        .optional()
        .describe(
          'The booking number if the admin said one ("VB-0012"), or the customer\'s name exactly as the admin said it. ' +
            "Leave out when the fuel isn't for a booking. Don't look the booking up yourself first.",
        ),
      vehicle: z.string().max(60).optional().describe('The vehicle as the admin said it ("the Innova"), if they said one.'),
      amount: z.number().positive().optional().describe("Rupees. Only the amount the admin said; never work one out."),
      litres: z.number().positive().optional().describe("Only if the admin said the litres; never work them out."),
      spent_on: z
        .string()
        .refine(isIsoDate, "A date like 2026-11-15")
        .optional()
        .describe("YYYY-MM-DD, only if the admin said another day (use get_today for 'yesterday'). Leave out for today."),
      note: z.string().max(200).optional(),
    }),
    responseFormat: "content_and_artifact",
  },
);
