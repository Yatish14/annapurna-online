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
- What the admin **types or says** still goes to Google (the question itself), except phone numbers, which are
  masked (below). So in strict mode the customer's name and phone for a new booking are typed into the draft card,
  not the chat (9.5), and a note under the chat box says so (9.6). Voice goes through the browser's speech service
  (Google, in Chrome).

## Phone numbers typed in the chat are masked (23 Nov 2026)

Privacy-first mode controls what our server adds; the admin's own words still went to Google as typed. So phone
numbers are now swapped out of everything the model gets, in both modes (`lib/assistant/phones.ts`):

- **Where:** the main model (the question, the chat's earlier turns, the tools' results), the off-topic check and
  the title writer. The model reads `[phone 1]`, `[phone 2]`…
- **How it still works:** the model passes the label on ("customer_phone: [phone 1]"), and the graph's tools step
  puts the real number back before the tool runs. The draft, the card, the saved chat and the answer the admin
  reads all have the real number; the answer's words are unmasked as they stream.
- **No memory needed:** labels are numbered in the order the numbers first appear in the messages, so the model
  step, the tools step and the route showing the answer each work them out from the same messages and agree.
- **What counts as a phone:** a mobile (10 digits from 6-9, with or without +91, 91 or 0, split by spaces,
  hyphens, dots or brackets, in Telugu or Hindi digits too) and a landline with its 0. Dates, amounts (no commas
  allowed inside a number) and booking numbers are left alone. Every case is in `tests/phones.spec.ts`.
- **What it can't catch:** numbers said in words, or split over two messages. Names aren't masked: "Ravi" could
  be a customer, a driver or a place, so typing names on the card (9.5) is still the rule in strict mode.
- **Checked:** the leak test now also searches the admin's questions and the model's earlier answers in every
  request for any phone number. Replayed, all 101 cases in both modes: none. With Gemini 3.5 Flash-Lite on the 5
  cases with phone numbers: 5/5 passed, no number sent, and the tools got the real numbers.

## The leak test (9.7)

`npm run eval -- --privacy strict --leaks` runs the eval cases in privacy-first mode and records every request the
model would get (`evals/leaks.ts`). It then searches what our server put in them (the system prompts and the tool
results) for every customer's, referrer's, driver's and user's name, every phone number, and every amount of ₹500 or
more in the eval database. The admin's own question isn't searched: they typed it (9.6 says so under the chat box).
It fails the run if anything is found.

- **Normal mode fails it, as it should**: replaying the recorded answers in normal mode (`npm run eval -- --model
  replay --leaks`, free) finds names, phones or amounts in all 88 tool cases, and the admin's first name in every
  prompt. So the test can fail: it passes in strict mode because nothing is there, not because it looks in the wrong place.
- **Strict mode replayed, all 100 cases** (free, what CI runs on every push): none found.
- **Strict mode, 18 Nov 2026**, with Gemini 3.1 Flash-Lite answering 30 cases for real: 100 system prompts and tool
  results checked for 34 names, 33 phones and 85 amounts. **None found.**
- The admin's name in the prompt is covered too: the runner passes the eval admin's real first name from the database,
  and strict mode leaves it out (9.3).

## Normal vs strict, compared (9.8)

The same 30 cases (the first 30 that aren't off-topic checks), the same model (Gemini 3.1 Flash-Lite, since 3.5
Flash-Lite's daily requests were used up that day), each mode once:

| Mode | Right tools | Passed | Seconds a case | Requests | Tokens in | Out |
|---|---|---|---|---|---|---|
| Normal | 30/30 | 30 | 5.5 | 61 | 3,49,306 | 2,746 |
| **Strict** | **30/30** | 29 | 2.6 | 63 | 3,65,219 | 1,696 |

**What still works**: choosing tools (every case), follow-ups by booking number (search, then open the booking it
found), dates, Telugu and Hindi, help answers (the guides aren't database data), and drafts. The one "failure" is
the privacy rule working: asked to book for "Ravi Kumar, 98480 22338", the model left the name and phone out of the
draft, because in strict mode they're typed on the card (9.5). The case expected normal mode's behaviour.

**What changes is the words.** The data moves from the answer to the card:

| Question | Normal | Strict |
|---|---|---|
| Who still owes us money? | "Ten customers owe ₹79,300. The largest: Usha Rani (VB-0023) ₹14,000, …" | "There are 10 bookings with balances due. The details and amounts are on the card below." |
| What was our profit last month? | "The bookings profit was ₹18,993; after all costs, a loss of ₹56,407." | "The profit for last month is shown in the report below." |
| Did Anitha Reddy pay the full amount? | "Yes, she paid the full ₹4,900 (VB-0004)." | "See the booking's card below: it shows the total, the payments and the balance." |

So strict mode is right but less helpful: a yes/no question about the data gets "see the card" instead of "yes".
Answers are shorter (1,696 output tokens against 2,746) and faster. A middle way, if wanted later: let code, not
the model, write sentences with numbers from the result ("Paid in full: ₹4,900"), added under the model's answer.
That's the "sentences with numbers come from our code" trade-off from the start of Step 9.

## Going online (10.1): a checklist for the owner

Not done here: it changes the live site and the real database, which is the owner's decision. In order:

1. **Neon**: `npm run db:migrate` with `DATABASE_URL` pointing at Neon adds the assistant's tables (drafts, chats,
   messages, usage, help guides) and the pgvector extension (Neon has it). Nothing existing is changed.
2. **The help guides**: `npm run kb:ingest` with the same `DATABASE_URL` (about 104 embedding requests, once).
3. **Vercel → Settings → Environment Variables**: `GOOGLE_API_KEY` (never `NEXT_PUBLIC_…`) and
   `ASSISTANT_PRIVACY=strict`. Redeploy.
4. **The key's tier.** On Google's free tier, what's sent may be used to improve Google's products; on the paid tier it
   isn't (pricing page, 18 Nov 2026). With privacy-first mode only the admins' own questions go, but they can still
   name customers. For real use, a paid key is the safer choice; the usage page shows what it would cost (about
   ₹0.24 a question with Flash-Lite).
5. **Try it on the live site** with a viewer and an admin sign-in, then the phone mic over HTTPS (7.6).
