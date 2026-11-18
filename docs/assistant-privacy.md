# Annapurna Assist's privacy-first mode (Step 9)

**The rule** (the owner's words): the business's data should be seen only by its admins and viewers, never by
another company's AI. Today Annapurna Assist sends Google the results of its tools: customers' names, phones,
amounts. That's fine for learning on sample data. It is **not** fine with real customers, so before real data or
production, privacy-first mode goes on: `ASSISTANT_PRIVACY=strict` in the environment.

## How strict? (9.1)

Three levels were possible:

| Level | The model sees | Can answer | Risk |
|---|---|---|---|
| 1. Shown to the admin | only that the tool ran | nothing about the result | none, but the chat feels broken ("here you go" for an empty list) |
| **2. Status (chosen)** | found / none / too many / failed, how many rows, row numbers and booking or order numbers, which fields are still missing | "3 bookings, they're below", "Which booking: row 1 or 2?", "I still need the date" | none of the customers' or drivers' details reach Google |
| 3. Non-personal totals | level 2 plus money totals, counts per car… | "₹42,000 came in this month" | amounts are the business's financial data: still the owner's data, still sent |

**Chosen: level 2, status.** The model chooses tools and words; our code shows the data.

### What the model gets in strict mode

- **Never**: customers' or drivers' names, phones, amounts of money, notes, file names, addresses, the admin's name.
- **Yes**: the tool's status, how many rows, each row's number and booking or printout number (`VB-0012`,
  `P-1003`) with its trip status (Upcoming, On trip…) and dates, the month asked about, which form fields are still
  missing, and fixed notes we wrote ("the figures are on the card under your answer").
- Booking and printout numbers are kept on purpose: they're the business's own reference numbers, not personal
  data, and they're what makes follow-ups work ("open the second one" → `get_booking VB-0012`). Dates and trip
  statuses aren't personal either.
- **The help guides** (`search_help`) and **the date** (`get_today`) are unchanged: neither is database data.

### What the admin sees

Everything, as before, on the **cards** under each answer: tables, numbers, files, drafts. In strict mode every tool
has a card (in normal mode some answered in words only), and when a draft can't be made the reason goes on a card
too, since the model can't read it out.

### What it costs

- No open-ended analysis of the data ("which customer pays late most often?"): the model can't see it.
- Sentences with numbers come from the cards, not the model: "₹42,000 came in" becomes "the figures are below".
- What the admin **types or says** still goes to Google (the question itself). So in strict mode the customer's
  name and phone for a new booking are typed into the draft card, not the chat (9.5), and a note under the chat box
  says so (9.6). Voice goes through the browser's speech service (Google, in Chrome).
