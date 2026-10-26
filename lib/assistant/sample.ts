// Sample chats and canned replies, so the Annapurna Assist page can be built and tried before there is a model.
// Nothing here reads or writes the database. Dates are relative to today, like scripts/seed-expenses.mjs.
// Delete this file once the API route answers for real (docs/assistant-plan.md, Step 1.6 onwards).
import { addDays, fmtDayMonth, fmtLong, fmtRange, MONTHS_LONG } from "@/lib/dates";
import { formatRupees } from "@/lib/expenses/money";
import type { BookingRow, Card, Chat, Message, Reply } from "./types";

/** Questions shown on an empty chat, one tap to ask */
export const SUGGESTIONS = [
  { icon: "bookings", text: "Which bookings are on the road this week?" },
  { icon: "rupee", text: "Who owes us money?" },
  { icon: "chart", text: "Give me last month's report" },
  { icon: "plus", text: "Book the Innova for Ravi Kumar, Vijayawada to Tirupati, a week from today, 3 days" },
] as const;

const lastMonth = (today: string) => {
  const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1));
  return { value: d.toISOString().slice(0, 7), label: `${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}` };
};

function onTheRoad(today: string): BookingRow[] {
  return [
    { no: "VB-0038", customer: "Lakshmi Prasanna", vehicle: "Innova Crysta", driver: "Suresh Babu", dates: fmtRange(addDays(today, -1), addDays(today, 1)), balance: 4500 },
    { no: "VB-0039", customer: "Mohammed Imran", vehicle: "Kia Carens", driver: "Ramesh Naidu", dates: fmtRange(today, addDays(today, 1)), balance: 0 },
    { no: "VB-0040", customer: "Harika", vehicle: "Maruti Ertiga", driver: "Venkat Rao", dates: fmtRange(addDays(today, 2), addDays(today, 2)), balance: 7800 },
  ];
}

function owing(today: string): BookingRow[] {
  return [
    { no: "VB-0031", customer: "Srinivasa Rao", vehicle: "Kia Carens", driver: "Ramesh Naidu", dates: fmtRange(addDays(today, -12), addDays(today, -10)), balance: 6200 },
    { no: "VB-0034", customer: "Anitha Reddy", vehicle: "Innova Crysta", driver: "Suresh Babu", dates: fmtRange(addDays(today, -6), addDays(today, -5)), balance: 3500 },
    { no: "VB-0038", customer: "Lakshmi Prasanna", vehicle: "Innova Crysta", driver: "Suresh Babu", dates: fmtRange(addDays(today, -1), addDays(today, 1)), balance: 4500 },
  ];
}

// ---------- Replies (one per kind of question) ----------

function bookingsReply(today: string): Reply {
  const rows = onTheRoad(today);
  return {
    steps: [{ label: "Checked bookings", icon: "bookings" }],
    text: `**${rows.length} bookings** are on the road this week. Suresh Babu is out with the Innova until ${fmtDayMonth(addDays(today, 1))}, and Harika's drop to Hyderabad is the only one still to start.`,
    cards: [{ kind: "bookings", title: "On the road this week", rows, link: { href: "/admin/expenses/bookings", label: "All bookings" } }],
  };
}

function owingReply(today: string): Reply {
  const rows = owing(today);
  const total = rows.reduce((sum, r) => sum + r.balance, 0);
  return {
    steps: [{ label: "Checked balances", icon: "rupee" }],
    text: `**${formatRupees(total)}** is still to come in from ${rows.length} customers. The oldest is Srinivasa Rao (VB-0031), finished ${fmtDayMonth(addDays(today, -10))}.`,
    cards: [{ kind: "bookings", title: "Balances due", rows, link: { href: "/admin/expenses", label: "Overview" } }],
  };
}

function reportReply(today: string): Reply {
  const month = lastMonth(today);
  return {
    steps: [
      { label: `Read ${month.label}`, icon: "calendar" },
      { label: "Built the report", icon: "chart" },
    ],
    text: `Here's **${month.label}**. Profit was ${formatRupees(122200)} from 18 bookings; fuel was the biggest cost at ${formatRupees(71400)}.`,
    cards: [
      {
        kind: "stats",
        title: month.label,
        items: [
          { label: "Bookings", value: "18", tone: "navy" },
          { label: "Money in", value: formatRupees(284500), tone: "green" },
          { label: "Money out", value: formatRupees(162300), tone: "red" },
          { label: "Profit", value: formatRupees(122200), tone: "gold" },
        ],
      },
      {
        kind: "file",
        name: `Annapurna report – ${month.label}.pdf`,
        detail: "Bookings, drivers, fuel and repairs · PDF",
        href: `/admin/expenses/reports/pdf?month=${month.value}&tab=all`,
      },
    ],
  };
}

function bookingDraftReply(today: string, draftId: string): Reply {
  const start = addDays(today, 7);
  return {
    steps: [
      { label: "Checked vehicles", icon: "car" },
      { label: "Checked drivers", icon: "steering" },
      { label: "Prepared a draft", icon: "edit" },
    ],
    text: "The Innova and Suresh Babu are both free on those dates. Check the booking below. **Nothing is saved until you press Confirm.**",
    cards: [
      {
        kind: "draft",
        id: draftId,
        title: "New booking",
        icon: "bookings",
        status: "pending",
        formHref: "/admin/expenses/bookings/new",
        fields: [
          { label: "Customer", value: "Ravi Kumar · 98480 22338" },
          { label: "Route", value: "Vijayawada → Tirupati, round trip" },
          { label: "Dates", value: `${fmtRange(start, addDays(start, 2))} · 3 days` },
          { label: "Vehicle", value: "Innova Crysta · ₹18 / km" },
          { label: "Driver", value: "Suresh Babu" },
          { label: "Advance", value: "None yet" },
        ],
      },
    ],
  };
}

function paymentDraftReply(today: string, draftId: string): Reply {
  return {
    steps: [
      { label: "Found VB-0038", icon: "search" },
      { label: "Prepared a draft", icon: "edit" },
    ],
    text: `This clears Lakshmi Prasanna's balance on VB-0038. **Nothing is saved until you press Confirm.**`,
    cards: [
      {
        kind: "draft",
        id: draftId,
        title: "New payment",
        icon: "rupee",
        status: "pending",
        formHref: "/admin/expenses/bookings/VB-0038",
        fields: [
          { label: "Booking", value: `VB-0038 · Lakshmi Prasanna` },
          { label: "Amount", value: formatRupees(4500) },
          { label: "Method", value: "UPI" },
          { label: "Date", value: fmtLong(today) },
        ],
      },
    ],
  };
}

function fuelDraftReply(today: string, draftId: string): Reply {
  return {
    steps: [
      { label: "Found Suresh Babu's booking", icon: "search" },
      { label: "Prepared a draft", icon: "edit" },
    ],
    text: "I've put it on VB-0038, the booking Suresh Babu is on today. **Nothing is saved until you press Confirm.**",
    cards: [
      {
        kind: "draft",
        id: draftId,
        title: "New fuel entry",
        icon: "fuel",
        status: "pending",
        formHref: "/admin/expenses/bookings/VB-0038",
        warning: "₹4,000 is more than this booking's usual fill-up (about ₹3,200). Check the amount.",
        fields: [
          { label: "Booking", value: "VB-0038 · Innova Crysta" },
          { label: "Amount", value: formatRupees(4000) },
          { label: "Paid by", value: "Driver (Suresh Babu)" },
          { label: "Date", value: fmtLong(today) },
        ],
      },
    ],
  };
}

const printReply: Reply = {
  steps: [{ label: "Checked print orders", icon: "printer" }],
  text: "**3 print orders** are waiting to be printed. The oldest came in 40 minutes ago (order 214, 6 pages in colour).",
  cards: [
    {
      kind: "stats",
      title: "Print orders today",
      items: [
        { label: "Waiting", value: "3", tone: "gold" },
        { label: "Printed", value: "9", tone: "green" },
        { label: "Not collected", value: "2", tone: "navy" },
      ],
    },
  ],
};

const fuelHelpReply: Reply = {
  steps: [{ label: "Searched the help guides", icon: "search" }],
  text: [
    "To add fuel to a booking:",
    "1. Open **Expense Tracker → Bookings** and open the booking.",
    "2. In **Money, fuel and km**, add a fuel entry.",
    "3. Enter the amount and who paid for it, then save.",
    "If the driver paid from their own pocket, choose the driver, so it shows in what you owe them.",
  ].join("\n"),
  cards: [
    {
      kind: "sources",
      items: [
        { title: "Adding fuel to a booking", section: "How-to guides" },
        { title: "Paying drivers", section: "How-to guides" },
      ],
    },
  ],
};

const offTopicReply: Reply = {
  text: "I can only help with Annapurna's work: bookings, payments, fuel, drivers and vehicles, print orders, reports, and how to use this admin. Try asking **“Who owes us money?”**",
};

const unknownReply: Reply = {
  text: [
    "This page uses **sample answers** for now, so I can't look that up yet. Try one of these:",
    "- Which bookings are on the road this week?",
    "- Who owes us money?",
    "- Give me last month's report",
    "- Record ₹4,500 from Lakshmi Prasanna by UPI",
    "- How do I add fuel?",
  ].join("\n"),
};

/**
 * Picks a canned reply by keywords. The real assistant replaces this with the model and its tools.
 * The order matters: "how do I add fuel" is a help question, "add ₹4,000 diesel" is a fuel entry.
 */
export function sampleReply(question: string, today: string, draftId: string): Reply {
  const q = question.toLowerCase();
  const has = (...words: string[]) => words.some((w) => q.includes(w));

  if (has("weather", "cricket", "movie", "poem", "joke", "song", "recipe", "news", "ipl", "election")) return offTopicReply;
  if (has("how do", "how to", "how can", "where do", "where is")) return fuelHelpReply;
  if (has("print")) return printReply;
  if (has("report", "last month", "profit", "september", "october", "summary")) return reportReply(today);
  if (has("owe", "balance", "due", "pending amount")) return owingReply(today);
  if (has("fuel", "diesel", "petrol")) return fuelDraftReply(today, draftId);
  if (has("record", "received", "paid", "payment")) return paymentDraftReply(today, draftId);
  if (has("book ", "new booking", "innova for", "carens for", "ertiga for")) return bookingDraftReply(today, draftId);
  if (has("booking", "trip", "road", "today", "week", "driver", "vehicle")) return bookingsReply(today);
  return unknownReply;
}

let nextBookingNo = 42;

/** What Confirm answers in the sample. The real one comes back from the server action after it saves. */
export function sampleConfirm(card: Extract<Card, { kind: "draft" }>): { result: string; reply: string } {
  if (card.icon === "bookings") {
    const no = `VB-${String(nextBookingNo++).padStart(4, "0")}`;
    return { result: `Saved as ${no}`, reply: `Done. **${no}** is booked. Want me to record an advance?` };
  }
  if (card.icon === "rupee") return { result: "Payment saved on VB-0038", reply: "Done. VB-0038 is now **fully paid**." };
  return { result: "Fuel saved on VB-0038", reply: "Done. The fuel is on VB-0038 and in what you owe Suresh Babu." };
}

// ---------- Saved chats for the history list ----------

const ask = (id: string, text: string, time: string, voice?: boolean): Message => ({ id, role: "user", text, time, voice });
const answer = (id: string, reply: Reply, time: string): Message => ({ id, role: "assistant", time, ...reply });

/** The draft in the saved "Book the Innova" chat was already confirmed */
function confirmed(reply: Reply, result: string): Reply {
  const cards = reply.cards?.map((c): Card => (c.kind === "draft" ? { ...c, status: "confirmed", result } : c));
  return { ...reply, cards };
}

export function sampleChats(today: string): Chat[] {
  return [
    {
      id: "chat-week",
      title: "Bookings on the road this week",
      when: "Today",
      messages: [
        ask("m1", "Which bookings are on the road this week?", "9:12 am"),
        answer("m2", bookingsReply(today), "9:12 am"),
      ],
    },
    {
      id: "chat-ravi",
      title: "Book the Innova for Ravi Kumar",
      when: "Today",
      messages: [
        ask("m1", "Book the Innova for Ravi Kumar 98480 22338, Vijayawada to Tirupati, a week from today, 3 days, Suresh driving", "8:40 am", true),
        answer("m2", confirmed(bookingDraftReply(today, "draft-ravi"), "Saved as VB-0041"), "8:40 am"),
        answer("m3", { text: "Done. **VB-0041** is booked for Ravi Kumar. Want me to record an advance?" }, "8:41 am"),
      ],
    },
    {
      id: "chat-report",
      title: `${lastMonth(today).label} report`,
      when: "Yesterday",
      messages: [ask("m1", "Give me last month's report", "6:05 pm"), answer("m2", reportReply(today), "6:05 pm")],
    },
    {
      id: "chat-owing",
      title: "Who owes us money?",
      when: fmtDayMonth(addDays(today, -3)),
      messages: [ask("m1", "Who owes us money?", "11:30 am"), answer("m2", owingReply(today), "11:30 am")],
    },
    {
      id: "chat-fuel-help",
      title: "How do I add fuel?",
      when: fmtDayMonth(addDays(today, -6)),
      messages: [ask("m1", "How do I add fuel to a booking?", "4:18 pm"), answer("m2", fuelHelpReply, "4:18 pm")],
    },
  ];
}
