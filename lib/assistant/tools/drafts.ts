import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { addDays, daysText, diffDays, fmtRange, isIsoDate } from "@/lib/dates";
import { formatPhone } from "@/lib/format";
import { fleetChoices } from "@/lib/expenses/fleet";
import { formatRupees, PAYMENT_METHODS } from "@/lib/expenses/money";
import { STATES } from "@/lib/expenses/places";
import { checkTrip, fromObject, parseTrip } from "@/lib/expenses/tripInput";
import { routeText } from "@/lib/expenses/trips";
import { draftOwner, saveDraft } from "../draftStore";
import { isStrict } from "../privacy";
import { choiceNames, matchName, nameAmong, placesNamed } from "../match";
import { freeText, toolReply } from "./result";

/**
 * draft_booking: prepares a new car booking from what the admin said, and checks it with exactly the booking form's
 * rules (parseTrip and checkTrip, lib/expenses/tripInput.ts, task 4.1). It SAVES NO BOOKING: the model never writes
 * business data (design decision 2). A ready draft is kept on the server for the admin who asked (assistant_drafts,
 * 4.5), and becomes a booking only when that admin presses Confirm on its card (4.4, 4.6).
 *
 * The model passes plain words ("Innova", "Ramesh", "Vijayawada"); our code turns them into the form's values:
 * the vehicle's and driver's ids, each city's state. Anything missing or wrong comes back as one clear question.
 */

type Fields = Record<string, string>;

/** Something only the admin can answer: what it's about, why, and the choices when there are some */
type Question = { about: string; why: string; choices?: string[] };
const isQuestion = (x: object): x is Question => "why" in x;

/** More choices than this aren't listed: the admin is asked for the full name instead */
const MAX_CHOICES = 8;

/** Choices as the model may see them: typed by people, so cleaned like any other name (2.15) */
const shown = (names: string[]) => names.map((n) => freeText(n, 60) ?? "");

/**
 * The vehicle or driver the admin's words mean, among those in use (switched-off ones can't take new bookings), or
 * the question to ask: which of several, or which one at all when nothing fits.
 */
function pick<T extends { name: string; phone?: string; active: boolean }>(said: string, items: T[], what: "vehicle" | "driver"): T | Question {
  const inUse = items.filter((i) => i.active);
  const match = matchName(said, inUse);
  if (!("candidates" in match)) return match.found;
  const { candidates } = match;
  if (candidates.length > MAX_CHOICES) {
    return { about: what, why: `"${said}" fits ${candidates.length} ${what}s. Ask for the full name.` };
  }
  if (candidates.length) {
    return { about: what, why: `"${said}" could be more than one ${what}.`, choices: shown(choiceNames(candidates)) };
  }
  const all = inUse.length <= MAX_CHOICES ? shown(choiceNames(inUse)) : undefined;
  const off = matchName(said, items.filter((i) => !i.active));
  if (off.found) {
    return { about: what, why: `${freeText(off.found.name, 60)} is switched off, so can't take new bookings. Ask for another ${what}.`, choices: all };
  }
  return { about: what, why: `No ${what} in use is called "${said}".`, choices: all };
}

/** A city as the form wants it: with its state, from the state the admin gave or the form's own list of places */
async function place(city: string | undefined, state: string | undefined, label: string): Promise<{ city: string; state: string } | Question> {
  if (!city) return { city: "", state: "" }; // parseTrip says what's missing
  const given = STATES.find((s) => s.toLowerCase() === state?.trim().toLowerCase());
  if (given) return { city: city.trim(), state: given };
  const found = await placesNamed(city);
  if (found.length === 1) return found[0];
  const about = `the ${label.toLowerCase()} city's state`;
  if (found.length > 1) return { about, why: `${label} ${city} is in more than one state.`, choices: found.map((f) => f.state) };
  return { about, why: `${label} ${city} isn't in the list of places, so its state is needed.` };
}

/** Stand-ins while the customer is to be typed on the card (9.5): only so the form's other checks can run */
const CARD_NAME = "Customer on the card";
const CARD_PHONE = "9000000000";

const ask = (note: string, missing: string) => toolReply({ status: "failed", data: { ready: false, missing }, note });

/** What the model passes to draft_booking: the admin's own words, matched and checked by our code */
const bookingArgs = z.object({
  customer_name: z.string().max(80).optional(),
  customer_phone: z.string().max(20).optional().describe("Only the number the admin gave. Never make one up."),
  vehicle: z.string().max(60).optional().describe('As the admin said it, e.g. "Innova" or "the Carens".'),
  driver: z.string().max(60).optional().describe('As the admin said it, e.g. "Ramesh".'),
  start_date: z.string().refine(isIsoDate, "A date like 2026-11-20").optional().describe("YYYY-MM-DD. Use get_today for 'tomorrow', 'next Friday'…"),
  days: z
    .number()
    .int()
    .min(1)
    .max(366)
    .optional()
    .describe('How many days, when the admin said "for 3 days". Then leave end_date out: the last day is worked out for you.'),
  end_date: z
    .string()
    .refine(isIsoDate, "A date like 2026-11-22")
    .optional()
    .describe('YYYY-MM-DD, only when the admin named the last day ("till the 22nd"). Leave out for a one-day booking.'),
  pickup_city: z.string().max(60).optional(),
  pickup_state: z.string().max(60).optional().describe("Only if the admin said it; otherwise it's found from the city."),
  // No default: left out must look different from false, for an earlier attempt's answer to fill it in (withEarlier)
  round_trip: z
    .boolean()
    .optional()
    .describe(
      'True ONLY if the admin said "round trip", "return" or that it comes back. "Vijayawada to Tirupati" is one way: false, with Tirupati as drop_city.',
    ),
  drop_city: z.string().max(60).optional().describe("Where a one-way trip ends."),
  drop_state: z.string().max(60).optional(),
  destination_city: z.string().max(60).optional().describe("Where a round trip goes."),
  destination_state: z.string().max(60).optional(),
  total_amount: z.number().nonnegative().optional().describe("Rupees agreed with the customer, if the admin said."),
  advance_amount: z.number().positive().optional().describe("Rupees the customer has already paid, if any."),
  advance_method: z.enum(["cash", "upi", "bank", "other"]).optional(),
  driver_amount: z.number().nonnegative().optional().describe("Rupees agreed with the driver, if the admin said."),
  notes: z.string().max(500).optional(),
  driver_is_busy_ok: z.boolean().default(false).describe("True only after the admin said to book a busy driver anyway."),
});
type BookingArgs = z.infer<typeof bookingArgs>;

/** Details that go together: when the model gives any of a group, the earlier attempt's others in it aren't used */
const TOGETHER: (keyof BookingArgs)[][] = [
  ["start_date", "days", "end_date"],
  ["pickup_city", "pickup_state"],
  ["round_trip", "drop_city", "drop_state", "destination_city", "destination_state"],
];

/**
 * The model's details, with anything it left out taken from the previous answer's attempt at this booking (the
 * route passes it as configurable.bookingSoFar, from this admin's own chat: lib/assistant/history.ts). Asked
 * "which vehicle?", the admin answers "crysta", and the model, rebuilding the call from the chat, can drop the
 * customer's name and phone given two messages back: our code keeps them, so it isn't the model's memory.
 * What the model passes always wins. Never carried over: "book the busy driver anyway", which the admin must say
 * about the driver on this attempt. Everything still goes through the form's checks, and onto the card to confirm.
 */
function withEarlier(given: BookingArgs, config: { configurable?: Record<string, unknown> } | undefined): BookingArgs {
  const parsed = bookingArgs.safeParse(config?.configurable?.bookingSoFar ?? {});
  if (!parsed.success) return given;
  const { driver_is_busy_ok: _, ...earlier } = parsed.data;
  const merged: Record<string, unknown> = { ...given };
  for (const [key, value] of Object.entries(earlier)) {
    const group = TOGETHER.find((g) => g.includes(key as keyof BookingArgs)) ?? [key as keyof BookingArgs];
    if (value !== undefined && group.every((k) => given[k] === undefined)) merged[key] = value;
  }
  return merged as BookingArgs;
}

export const draftBooking = tool(
  async (given, config) => {
    const a = withEarlier(given, config);
    // A one-way trip given only a "destination": that's where it ends (the model mixed the two up once, costing a turn)
    const dropCity = a.drop_city ?? (a.round_trip ? undefined : a.destination_city);
    const dropState = a.drop_city ? a.drop_state : (a.drop_state ?? a.destination_state);

    // 0. Everything that's missing, in one go: the form's checks stop at the first problem, but in a chat the admin
    //    should be asked for all of it in one question, not one turn at a time
    // Privacy-first mode (9.5): the customer's name and phone are typed into the card, never the chat, so they aren't
    // asked for. Until then, stand-ins let the form's other checks run; the draft keeps them empty, and Confirm
    // needs them from the card (lib/assistant/confirm.ts).
    const onCard = isStrict() && !a.customer_name && !a.customer_phone;
    const missing = [
      !a.customer_name && !onCard && "the customer's name",
      !a.customer_phone && !onCard && "the customer's mobile number",
      !a.vehicle && "the vehicle",
      !a.driver && "the driver",
      !a.start_date && "the dates",
      !a.pickup_city && "the pickup city",
      !(a.round_trip ? a.destination_city : dropCity) && (a.round_trip ? "where the round trip goes" : "the drop city"),
    ].filter(Boolean);
    if (missing.length) {
      return ask(`Still needed: ${missing.join(", ")}. Ask the admin for all of these in one short question; never fill them in yourself.`, "several");
    }

    // 1. Vehicle, driver and places: the admin's words matched by our code (match.ts). Everything unclear is asked
    //    together (4.3): "Ravi" could be two drivers AND Aurangabad is in two states → one question, with the choices.
    //    The model never chooses: it has the names, but which one the admin meant only the admin knows.
    const { vehicles, drivers } = await fleetChoices();
    const vehicle = pick(a.vehicle!, vehicles, "vehicle"); // "!": step 0 made sure both were given
    const driver = pick(a.driver!, drivers, "driver");
    const pickup = await place(a.pickup_city, a.pickup_state, "Pickup");
    const other = a.round_trip
      ? await place(a.destination_city, a.destination_state, "Destination")
      : await place(dropCity, dropState, "Drop");
    if (isQuestion(vehicle) || isQuestion(driver) || isQuestion(pickup) || isQuestion(other)) {
      return toolReply({
        status: "failed",
        data: { ready: false, ask_about: [vehicle, driver, pickup, other].filter(isQuestion) },
        note:
          "Ask the admin all of these in one short question, listing the choices. Never choose for them, even if one " +
          "seems likelier. When they answer, call again with the choice exactly as listed.",
      });
    }

    // 2. Everything as the booking form's fields, then the form's own checks
    const fields: Fields = {
      customer_name: onCard ? CARD_NAME : (a.customer_name ?? ""),
      customer_phone: onCard ? CARD_PHONE : (a.customer_phone ?? ""),
      vehicle_id: String(vehicle.id),
      driver_id: String(driver.id),
      start_date: a.start_date ?? "",
      // "For 3 days" from the 16th ends on the 18th: counted by our code (the model got it wrong once: 16th–19th)
      end_date: a.end_date ?? (a.start_date && a.days ? addDays(a.start_date, a.days - 1) : (a.start_date ?? "")),
      pickup_state: pickup.state,
      pickup_city: pickup.city,
      round_trip: a.round_trip ? "1" : "",
      ...(a.round_trip ? { dest_state: other.state, dest_city: other.city } : { drop_state: other.state, drop_city: other.city }),
      total_amount: a.total_amount != null ? String(a.total_amount) : "",
      advance_amount: a.advance_amount != null ? String(a.advance_amount) : "",
      advance_method: a.advance_method ?? "cash",
      driver_amount: a.driver_amount != null ? String(a.driver_amount) : "",
      notes: a.notes ?? "",
      // As the form sends it after "book anyway": Confirm checks again with the same answer (4.6)
      ...(a.driver_is_busy_ok ? { allow_driver_clash: "1" } : {}),
    };
    const parsed = parseTrip(fromObject(fields), true);
    // The form's own message ("Choose the driver.", "The advance is more than the total…"), for the model to ask about
    if (!parsed.ok) return ask(`${parsed.error} (Ask the admin; never fill it in yourself.)`, parsed.field);
    const check = await checkTrip(parsed.input, { allowDriverClash: a.driver_is_busy_ok });
    if (!check.ok && "driverClash" in check) {
      return ask(`${check.driverClash} Ask the admin whether to book them anyway, or choose another driver.`, "driver");
    }
    if (!check.ok) return ask(check.error, check.field);

    // 3. Ready: the booking as the admin will check it on the card (4.4). Kept as a draft; no booking is saved.
    const { input } = parsed;
    const days = diffDays(input.startDate, input.endDate) + 1;
    // A busy driver the admin said to book anyway: the card says which booking they're already on. Checked again,
    // because the model may set driver_is_busy_ok without being told the driver was busy.
    const again = a.driver_is_busy_ok ? await checkTrip(input) : null;
    const driverBusy = again && !again.ok && "driverClash" in again ? again.driverClash : null;

    // Kept on the server for the admin who asked (4.5). Their id comes from the signed-in session, passed in by
    // the API route: never from the model or the browser. The card gets only the draft's id.
    const kept = onCard ? { ...fields, customer_name: "", customer_phone: "", customer_on_card: "1" } : fields;
    const draftId = await saveDraft(draftOwner(config, "draft_booking"), "booking", kept);
    return toolReply({
      status: "found",
      data: {
        ready: true,
        booking: {
          customer: onCard ? null : freeText(input.customerName, 60),
          phone: onCard ? null : formatPhone(input.customerPhone),
          vehicle: freeText(check.vehicle.name, 60),
          // With the phone if another driver in use has the same name, so the admin can see which Ravi Kumar it is
          driver: freeText(nameAmong(driver, drivers.filter((d) => d.active)), 60),
          dates: `${fmtRange(input.startDate, input.endDate)} (${daysText(days)})`,
          route: routeText({ pickup_city: input.pickupCity, drop_city: input.dropCity, round_trip: input.roundTrip, dest_city: input.destCity }),
          total: parsed.totalAmount !== null ? formatRupees(parsed.totalAmount) : "not set yet",
          advance: parsed.advance ? `${formatRupees(parsed.advance.amount)} by ${PAYMENT_METHODS[parsed.advance.method]}` : "none",
          driver_amount: parsed.driverAmount !== null ? formatRupees(parsed.driverAmount) : "not set yet",
          notes: freeText(input.notes, 300),
        },
        // The checked form values stay on the server (assistant_drafts); this id is all the card carries
        draft_id: draftId,
        driver_busy: driverBusy,
        // 9.5: the card asks the admin for the customer's name and mobile number
        customer_on_card: onCard || undefined,
      },
      note:
        "Checked with the booking form's rules. NO BOOKING IS SAVED. The admin sees these details on a card under your " +
        "answer, with Confirm, Open in form and Cancel buttons; only their Confirm saves it, you can't.",
    });
  },
  {
    name: "draft_booking",
    description:
      "Prepares a NEW car booking and checks it with the booking form's own rules: the vehicle and driver are matched " +
      "by name and must be free on those days, each city's state is found, and every required detail is checked. " +
      "It saves nothing: it says what's missing or wrong, or returns the booking ready for the admin to check and " +
      "confirm. Call it again with the missing details when the admin answers.",
    schema: bookingArgs,
    responseFormat: "content_and_artifact",
  },
);
