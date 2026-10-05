// The WhatsApp booking conversation.
//
// Hi → menu → car → adults → children → start date → number of days → pickup → confirm → enquiry saved
//
// Every button / list option carries an ID like "car:carens" or "date:2026-10-12", and what the
// customer has chosen so far is kept in wa_sessions, so each incoming message can be handled on its own.

import { logActivity } from "../activity";
import {
  bookedDays,
  createEnquiry,
  freeDaysFrom,
  freeStartDates,
  isBookableStart,
} from "../bookings";
import { BOOKING_RULES, BUSINESS, CARS, isCarId, passengersText, type CarId } from "../config";
import { addDays, daysText, fmtRange, fmtRangeCompact, fmtShort, isIsoDate } from "../dates";
import { sendButtons, sendList, sendText, type ListRow } from "./client";
import { claimSession, clearSession, getSession, saveSession, type Draft, type Session } from "./session";

export type IncomingMessage = {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
};

const GREETING = /^(hi+|hello|hey|menu|start|restart|namaste|namaskaram|book)\b/i;
const DATES_PER_PAGE = 8;

type Party = { car: CarId; adults: number; children: number };

function party(d: Draft): Party | null {
  return d.car && d.adults && d.children !== undefined ? { car: d.car, adults: d.adults, children: d.children } : null;
}

function toInt(value: string): number {
  return /^\d+$/.test(value) ? Number(value) : NaN;
}

// ---------- Entry point ----------

export async function handleMessage(msg: IncomingMessage, customerName: string | null): Promise<void> {
  const to = msg.from;
  const choice = msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id;
  const session = await getSession(to);

  if (choice) return handleChoice(to, choice, session, customerName);

  const text = msg.type === "text" ? msg.text?.body.trim() ?? "" : "";
  const isGreeting = GREETING.test(text);

  if (session?.step === "pickup" && !isGreeting) {
    if (msg.type === "location" && msg.location) return handlePickup(to, locationText(msg.location), session);
    if (text) return handlePickup(to, text, session);
  }

  if (session && !isGreeting && msg.type === "text") {
    return sendText(to, "Please tap one of the options above 👆\nOr type *menu* to start over.");
  }

  if (msg.type !== "text" && msg.type !== "location") {
    await sendText(to, "Sorry, I can only read text messages and button taps.");
  }
  await clearSession(to);
  return sendWelcome(to, customerName);
}

async function handleChoice(to: string, choice: string, session: Session | null, customerName: string | null) {
  const sep = choice.indexOf(":");
  const kind = sep === -1 ? choice : choice.slice(0, sep);
  const value = sep === -1 ? "" : choice.slice(sep + 1);
  const draft: Draft = session?.draft ?? {};

  switch (kind) {
    case "menu":
      if (value === "book") return askCar(to);
      if (value === "services") return sendServices(to);
      if (value === "contact") return sendContact(to);
      break;

    case "car":
      if (isCarId(value)) return askAdults(to, value);
      break;

    case "adults": {
      const adults = toInt(value);
      if (draft.car && adults >= 1 && adults <= CARS[draft.car].maxAdults) {
        const room = CARS[draft.car].maxTotal - adults;
        if (room > 0) return askChildren(to, draft.car, adults);
        return askDate(to, { car: draft.car, adults, children: 0 }, 0);
      }
      break;
    }

    case "children": {
      const children = toInt(value);
      if (draft.car && draft.adults && children >= 0 && draft.adults + children <= CARS[draft.car].maxTotal) {
        return askDate(to, { car: draft.car, adults: draft.adults, children }, 0);
      }
      break;
    }

    case "dates": {
      const p = party(draft);
      const page = toInt(value);
      if (p && page >= 0) return askDate(to, p, page);
      break;
    }

    case "date": {
      const p = party(draft);
      if (p && isIsoDate(value) && isBookableStart(value)) return askDays(to, p, value);
      break;
    }

    case "days": {
      const p = party(draft);
      const days = toInt(value);
      if (p && draft.start && days >= 1) return chooseDays(to, p, draft.start, days);
      break;
    }

    case "confirm":
      if (value === "restart") return askCar(to);
      if (value === "yes" && session?.step === "confirm") return finishBooking(to, session.draft, customerName);
      break;
  }

  // An old button from an earlier conversation, or the session timed out
  await clearSession(to);
  await sendText(to, "That option has expired. Let's start again 🙂");
  return sendWelcome(to, customerName);
}

// ---------- Menu ----------

function sendWelcome(to: string, customerName: string | null) {
  const hello = customerName ? `🙏 Namaskaram ${customerName}!` : "🙏 Namaskaram!";
  return sendButtons(
    to,
    `${hello}\nWelcome to *${BUSINESS.name}* & *${BUSINESS.travelName}*.\n\nHow can we help you today?`,
    [
      { id: "menu:book", title: "🚗 Book a Car" },
      { id: "menu:services", title: "📋 Our Services" },
      { id: "menu:contact", title: "📞 Talk to Us" },
    ],
  );
}

function sendServices(to: string) {
  return sendText(
    to,
    [
      "📋 *Our Services*",
      "",
      "*Online Services*",
      "Aadhaar · PAN Card · Voter ID · Passport · Driving Licence · Birth/Death & Income/Caste Certificates · Electricity Bills · Mobile Recharge · Insurance · AEPS · e-Stamp · Credit Card Services · Xerox/Printing",
      "",
      "💵 Aadhaar & Credit Card Cash Withdrawal",
      "",
      "*Tours & Travels*",
      "Flights (IndiGo, Air India) · Train · Bus · APSRTC tickets · Car booking with driver · FASTag · Vehicle Insurance",
      "",
      `Visit us or call ${BUSINESS.phoneDisplay}.`,
      "Type *menu* to go back.",
    ].join("\n"),
  );
}

function sendContact(to: string) {
  return sendText(
    to,
    [
      "📞 *Talk to Us*",
      "",
      `Call: ${BUSINESS.phoneDisplay}`,
      `Email: ${BUSINESS.email}`,
      "",
      "Type *menu* to see options.",
    ].join("\n"),
  );
}

// ---------- Booking steps ----------

async function askCar(to: string) {
  await saveSession(to, "car", {});
  const { carens, seltos } = CARS;
  return sendButtons(
    to,
    [
      "Choose your car. Every booking comes with a driver. 🧑‍✈️",
      "",
      `🚙 *${carens.name}*: up to ${carens.maxAdults} adults (${carens.maxTotal} with children)`,
      `🚘 *${seltos.name}*: up to ${seltos.maxTotal} passengers`,
    ].join("\n"),
    [
      { id: "car:carens", title: carens.name },
      { id: "car:seltos", title: seltos.name },
    ],
  );
}

async function askAdults(to: string, car: CarId) {
  await saveSession(to, "adults", { car });
  const { name, maxAdults } = CARS[car];
  const rows: ListRow[] = Array.from({ length: maxAdults }, (_, i) => ({
    id: `adults:${i + 1}`,
    title: `${i + 1} adult${i ? "s" : ""}`,
  }));
  return sendList(to, `How many *adults* (12 years and above) are travelling in the ${name}?`, "Select adults", "Adults", rows);
}

async function askChildren(to: string, car: CarId, adults: number) {
  await saveSession(to, "children", { car, adults });
  const room = CARS[car].maxTotal - adults;
  const rows: ListRow[] = Array.from({ length: room + 1 }, (_, n) => ({
    id: `children:${n}`,
    title: n === 0 ? "No children" : `${n} ${n === 1 ? "child" : "children"}`,
  }));
  return sendList(
    to,
    `How many *children* (below 12 years)?\nYou can add up to ${room} ${room === 1 ? "child" : "children"}.`,
    "Select children",
    "Children",
    rows,
  );
}

async function askDate(to: string, p: Party, page: number) {
  const booked = await bookedDays(p.car);
  const dates = freeStartDates(booked);
  const car = CARS[p.car].name;

  if (dates.length === 0) {
    await clearSession(to);
    return sendText(
      to,
      `😔 Sorry, the ${car} is fully booked for the next ${BOOKING_RULES.windowDays} days.\nPlease call ${BUSINESS.phoneDisplay} and we'll try to help.`,
    );
  }

  const pages = Math.ceil(dates.length / DATES_PER_PAGE);
  const current = Math.min(page, pages - 1);
  const slice = dates.slice(current * DATES_PER_PAGE, (current + 1) * DATES_PER_PAGE);

  const rows: ListRow[] = slice.map((d) => {
    const free = freeDaysFrom(booked, d);
    return { id: `date:${d}`, title: fmtShort(d), description: `Available for up to ${daysText(free)}` };
  });
  if (current > 0) rows.push({ id: `dates:${current - 1}`, title: "⬅️ Earlier dates" });
  if (current < pages - 1) rows.push({ id: `dates:${current + 1}`, title: "➡️ More dates" });

  await saveSession(to, "date", p);
  return sendList(
    to,
    `📅 Pick your *start date* for the ${car}.\nOnly available dates are shown.`,
    "Select date",
    "Available dates",
    rows,
  );
}

async function askDays(to: string, p: Party, start: string) {
  const booked = await bookedDays(p.car);
  const free = freeDaysFrom(booked, start);
  if (free === 0) {
    await sendText(to, "😔 Sorry, that date was just booked. Please pick another one.");
    return askDate(to, p, 0);
  }

  await saveSession(to, "days", { ...p, start });
  const rows: ListRow[] = Array.from({ length: free }, (_, i) => ({
    id: `days:${i + 1}`,
    title: `${daysText(i + 1)} · ${fmtRangeCompact(start, addDays(start, i))}`,
  }));
  const limitNote =
    free < BOOKING_RULES.maxDays
      ? `\n\n_The car is already booked from ${fmtShort(addDays(start, free))}, so up to ${daysText(free)} is possible._`
      : "";
  return sendList(
    to,
    `How many days do you need the ${CARS[p.car].name}, starting *${fmtShort(start)}*?${limitNote}`,
    "Select days",
    "Number of days",
    rows,
  );
}

async function chooseDays(to: string, p: Party, start: string, days: number) {
  const free = freeDaysFrom(await bookedDays(p.car), start);
  if (days > free) {
    await sendText(to, "😔 Sorry, some of those days were just booked.");
    return free > 0 ? askDays(to, p, start) : askDate(to, p, 0);
  }
  await saveSession(to, "pickup", { ...p, start, days });
  return sendText(
    to,
    "📍 Please type your *pickup location* (area, street or landmark).\n\nYou can also share your location using 📎 → Location.",
  );
}

function locationText(loc: NonNullable<IncomingMessage["location"]>): string {
  const label = [loc.name, loc.address].filter(Boolean).join(", ");
  const link = `https://maps.google.com/?q=${loc.latitude},${loc.longitude}`;
  return label ? `${label} (${link})` : `Shared location: ${link}`;
}

async function handlePickup(to: string, input: string, session: Session) {
  const p = party(session.draft);
  const { start, days } = session.draft;
  if (!p || !start || !days) {
    await clearSession(to);
    return sendWelcome(to, null);
  }

  const pickup = input.replace(/\s+/g, " ").trim().slice(0, 200);
  if (pickup.length < 3) {
    return sendText(to, "Please type a little more detail about the pickup location (area or landmark).");
  }

  await saveSession(to, "confirm", { ...p, start, days, pickup });
  const end = addDays(start, days - 1);
  return sendButtons(
    to,
    [
      "Please confirm your enquiry:",
      "",
      `🚙 *${CARS[p.car].name}* (with driver)`,
      `👥 ${passengersText(p.adults, p.children)}`,
      `📅 ${fmtRange(start, end)} (${daysText(days)})`,
      `📍 Pickup: ${pickup}`,
    ].join("\n"),
    [
      { id: "confirm:yes", title: "✅ Confirm" },
      { id: "confirm:restart", title: "✏️ Start Over" },
    ],
  );
}

async function finishBooking(to: string, draft: Draft, customerName: string | null) {
  const p = party(draft);
  const { start, days, pickup } = draft;
  if (!p || !start || !days || !pickup) return;

  // Claiming the session first means a double tap on Confirm only creates one enquiry
  if (!(await claimSession(to, "confirm"))) return;

  const free = freeDaysFrom(await bookedDays(p.car), start);
  if (!isBookableStart(start) || free < days) {
    await sendText(to, "😔 Sorry, those dates were just booked by someone else. Please pick another start date.");
    return askDate(to, p, 0);
  }

  const end = addDays(start, days - 1);
  const ref = await createEnquiry({
    phone: to,
    customerName,
    car: p.car,
    adults: p.adults,
    children: p.children,
    startDate: start,
    endDate: end,
    pickupLocation: pickup,
  });
  await logActivity(
    { name: customerName || "WhatsApp customer", mobile: to },
    "enquiry.created",
    ref,
    `${CARS[p.car].name} · ${fmtRange(start, end)} · ${passengersText(p.adults, p.children)} · via WhatsApp`,
  );

  return sendText(
    to,
    [
      "✅ *Enquiry received!*",
      `Ref: *${ref}*`,
      "",
      "We'll check availability and confirm here on WhatsApp shortly.",
      `For urgent queries, call ${BUSINESS.phoneDisplay}.`,
      "",
      "Type *menu* anytime to start again.",
    ].join("\n"),
  );
}
