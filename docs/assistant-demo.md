# Annapurna Assist: demo mode and a 2-minute video

## Demo mode

```bash
npm run demo              # Gemini answers (GOOGLE_API_KEY in .env.local), privacy-first mode on
npm run demo -- --fake    # no key, nothing sent to Google: the fake models (for rehearsing the clicks)
npm run demo -- --open    # privacy-first mode off: the model reads the sample data, as while building
npm run demo -- --fresh   # start the demo data again
```

It makes its own database (`.data/pglite-demo`) with the sample data only (made-up customers, drivers, bookings,
payments and printouts), the three sample sign-ins, and the help guides; then starts the site on
http://localhost:3200 with its own build folder, so `npm run dev` can keep running. Docker and Neon are never
touched. The sign-ins are printed when the demo database is made (the same as `npm run db:fresh`).

Before recording: run it once with `--fresh`, ask one throwaway question (the first answer compiles the page), and
check the free tier has requests left today (AI Studio → Rate limit). A recording uses about 15 Flash-Lite requests.

## The 2-minute video: shot list

Record the browser at 1280×800 (Windows: Win+Alt+R, or OBS). Speak over it, or add captions after.

| Time | Show | Say |
|---|---|---|
| 0:00–0:10 | The dashboard, then the **Annapurna Assist** link | "The admin dashboard of a small printing and car-rental business, with an AI assistant built in." |
| 0:10–0:25 | Ask **"Which bookings are coming up?"** The chip ticks, the table card appears | "It picks a tool, our code runs it on the database, and the table comes straight from the database: the model can't garble a number." |
| 0:25–0:40 | Ask **"Open the second one"** | "Follow-ups work by row number. In privacy-first mode the model only ever sees row and booking numbers: the names and amounts on screen never go to Google." |
| 0:40–1:00 | Ask **"Lakshmi Prasanna paid 2000 by UPI today"**, then press **Confirm** on the card | "It never writes data itself. It prepares a draft, checked with the same rules as the form, and only my Confirm saves it." |
| 1:00–1:15 | Tap the mic, pick **TE**, say **"ఈ నెల లాభం ఎంత?"** ("this month's profit?") | "Telugu, Hindi or English, typed or spoken; it answers in the language you used." |
| 1:15–1:30 | Ask **"How do I add a new driver?"**: the steps, and the sources card | "How-to questions come from the help guides through vector search with pgvector: 100% of the right guides in the top three in our retrieval eval." |
| 1:30–1:40 | Ask **"Write me a poem"**: the polite refusal | "An off-topic check stops anything that isn't about the business." |
| 1:40–1:55 | Open **Usage and cost** (super admin) | "Every question's tokens, time and what it would cost on the paid tier: about 24 paise a question. It runs on the free tier, so ₹0." |
| 1:55–2:00 | `docs/assistant-evals.md` or the CI run | "100 eval cases, graded by code and replayed in CI on every push." |

For the Telugu shot, the mic needs Chrome or Edge on `localhost` or HTTPS (not `http://192.168…`).
