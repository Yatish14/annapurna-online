# AI Assistant — build plan

An admin-only AI assistant inside the Annapurna admin: a chat page (text and voice) that answers
questions from live data, creates bookings / payments / fuel entries after you confirm, gives the
monthly report, and answers "how do I…" questions from a small knowledge base.

**Name:** Annapurna Assist.

**UI with sample data (done 26 Oct 2026):** the whole chat page works in the browser with canned answers from
`lib/assistant/sample.ts`, so nothing reads or writes real data yet. It covers the sidebar link and permission (1.1–1.3),
the chat (1.7, 1.9, 1.11, Stop from 1.12, the length limit and daily count from 1.15), tool chips and cards (2.12, 2.13),
the report file card (3.2), draft cards with Confirm / Open in form / Cancel (4.4, 4.7, 4.11), the chat list with
search and delete (5.4, 5.6, 5.8), help sources (6.10) and the mic with English / Telugu / Hindi (7.1–7.4).
Each of those tasks still needs its server side. When it's real, replace `sampleReply` with the API route and delete `sample.ts`.
(Done 17 Nov 2026, task 5.4: the chat list comes from the database and `sample.ts` is deleted; help sources and the
mic still need their server side, Steps 6 and 7.)

## How we work

- One task at a time. Each task changes one or two files and teaches one idea.
- For every task: make the change → explain every line → you try it → commit when you say so.
- Tick the box when a task is done.

## Stack

| Part | Choice |
|---|---|
| Language | TypeScript (same as the rest of the app) |
| Agent | LangGraph (`@langchain/langgraph`) |
| Main model, while building | Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`, free tier) via `@langchain/google` (`ChatGoogle`) |
| Main model, quality check | Gemini 3.8 Flash (`gemini-3.8-flash`, free tier): smarter, but only 20 requests a day |
| Cheap model (off-topic check, chat titles, AI judge) | Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`, free tier) |
| Spare (many requests, e.g. eval runs) | Gemma 4 31B: 14,400 a day, but only 16K tokens a minute; tool calling to be tried. Tried Gemma 4 26B as the off-topic check (10 Nov 2026): 8 of 15 calls failed with Google's "Internal error", about 6 s each, so the check uses Flash-Lite |
| Live data | Tools that call the existing functions in `lib/` (never raw SQL from the model) |
| RAG | pgvector in the local database, Gemini embeddings (`gemini-embedding-2`, 768 numbers, free tier) |
| Voice | The browser's speech recognition (en-IN, te-IN, hi-IN) |
| Tests | Playwright + a fake model (`ASSISTANT_FAKE=1`), so tests are free and repeatable |

## Design decisions

1. **Admins ask, everyone else views.** `useAssistant: ["super_admin", "admin"]`, checked on the server for the API
   route and every tool. Other roles see the same page, view only.
2. **The model never writes data.** Write tools only make a *draft* (saved server-side with an owner and an
   expiry). The confirmation card's button runs a server action that re-checks everything and uses the same
   code as the forms. Activity shows "via Assistant".
3. **Exact numbers come from tools, not RAG.** RAG is only for help text, business info and the glossary.
4. **Tool results are data, not instructions** (booking notes and names can't steer the assistant).
5. **Guardrails:** scope rules in the prompt + a cheap off-topic check + message length limit + daily cap per admin.
6. **Two privacy modes.** While learning (local database, sample data only) the model sees tool results, like a
   normal assistant. Before real data or production, **privacy-first mode** (Step 9) is switched on: no database
   data (customers, phones, amounts, admins' names) reaches Google. The model only picks a tool and its inputs; the
   server runs it and sends the rows straight to the screen as a card. So from Step 2, every tool returns
   **two things**: the data for the screen, and a short status for the model (found / none / too many / failed).

## Cost: ₹0 (Google's free tier)

This is a learning project, not for production, so it runs on the **free tier of the Gemini API**
(Google AI Studio key, no card, no billing account).

- **Limits** (AI Studio → Rate limit, 5 Nov 2026; per project; the day resets at midnight Pacific, about 1:30 pm IST):

  | Model | Requests a minute | Tokens a minute | Requests a day | ≈ questions a day |
  |---|---|---|---|---|
  | `gemini-3.5-flash-lite` | 15 | 250K | 500 | 170–250 |
  | `gemini-3.8-flash` | 5 | 250K | 20 | 7–10 |
  | Gemma 4 26B / 31B | 30 | 16K | 14,400 | many, but slow: about 1 question a minute |

  One question is usually 2–3 model calls (pick a tool, read its result, answer). So: the **fake model** for building
  the UI and tests, **Flash-Lite** for everyday testing, **3.8 Flash** for a few final checks. Over the limit →
  a "try again later" error (429), which the UI must show nicely.
- **Data:** on the free tier Google may use what we send to improve its products. So we only use the **sample data**
  (`npm run db:seed-expenses`) in the local database, never real customers' names or phone numbers.
- **Evals** run on the fake model (free, any number of times) and in small batches on the free tier.
- **Cost tracking (Step 8)** still counts tokens and shows what each question *would* cost on a paid model.
  Good for the resume, and it shows what production would cost.
- **Switching models later** (paid Gemini, Claude…) changes only `lib/assistant/model.ts` and the key.

Checked on 5 Nov 2026: `gemini-2.5-flash` and `gemini-2.5-pro` shut down on 1 Dec 2026; don't use them.

---

## Step 0 — Setup (outside the app)

- [x] **0.1** Google AI Studio: sign in, create an API key (free, no card), look at the Rate limit page. *Learn: keys, rate limits.*
- [x] **0.2** Put the key in `.env.local` as `GOOGLE_API_KEY` (never commit it); add an empty one to `.env.example`. *Learn: secrets stay server-side.*
- [x] **0.3** `npm i @langchain/google @langchain/core` (`@langchain/google` replaces the older `@langchain/google-genai`, which LangChain is deprecating). *Learn: what each package does.*
- [x] **0.4** `scripts/ai-hello.mjs` (`npm run ai:hello`): ask one question, print the reply and token counts. *Learn: a model call, tokens.*
- [x] **0.5** Add a system message to the script. *Learn: system vs user messages.*
- [x] **0.6** Print the reply word by word. *Learn: streaming.*

## Step 1 — Chat page (no tools yet)

- [x] **1.1** Add the `useAssistant` permission in `lib/auth.ts`. *Learn: role checks.*
- [x] **1.2** Add "Assistant" to `components/admin/Sidebar.tsx` (shown to everyone; view only for non-admins).
- [x] **1.3** `app/admin/assistant/page.tsx`: a signed-in page (view only for non-admins). *Learn: protecting a route.*
- [x] **1.4** `lib/assistant/model.ts`: model name and settings in one place (`ASSISTANT_MODEL` switches it).
- [x] **1.5** `lib/assistant/prompt.ts`: rules, scope, today's date in IST.
- [x] **1.6** `app/api/assistant/route.ts`: check login, call the model, return the full reply. *Learn: model calls stay on the server.*
- [x] **1.7** The chat (message list, input box, Send button, from the sample UI) asks `/api/assistant` instead of `sampleReply` (`components/assistant/AssistProvider.tsx`).
- [x] **1.8** The route streams the reply in chunks.
- [x] **1.9** The UI shows words as they arrive.
- [x] **1.10** Send earlier messages with each request. *Learn: the model remembers nothing between calls.*
- [x] **1.11** Styles in `app/admin.css` (bubbles, message box), matching the mockup.
- [x] **1.12** Errors (API down, rate limit) and a Stop button. *Learn: cancelling a request mid-reply.*
- [x] **1.13** Guardrail v1: scope rules in the prompt; try off-topic questions by hand.
- [x] **1.14** Guardrail v2: `lib/assistant/guard.ts`, a Flash-Lite check before the main model. *Learn: routing to a cheaper model.*
- [x] **1.15** Maximum message length and a daily question cap per admin (`lib/assistant/limits.ts`, the `assistant_usage` table; run `npm run db:migrate` on each database). *Learn: preventing abuse.*
- [x] **1.16** Fake model for tests (`ASSISTANT_FAKE=1`). *Learn: testing AI code without paying or random results.*
- [x] **1.17** Playwright test (`tests/assistant.spec.ts`, `npm run test:e2e`): an admin can chat (follow-ups, off-topic, errors, Stop, daily count); a viewer sees it view only and the API says 403; signed out gets 401.

## Step 2 — LangGraph and read-only tools

- [x] **2.1** `npm i @langchain/langgraph "zod@^4.2.0"` (LangGraph needs zod 4.2+; `@vercel/blob` keeps its own older copy).
- [x] **2.2** Smallest graph: START → model → END. *Learn: state, nodes, edges.*
- [x] **2.3** First tool `get_today` (`lib/assistant/tools/`; every tool returns status + data through `toolReply()`). *Learn: tool definition with a zod schema.*
- [x] **2.4** Tool loop: model → tools → model until done. *Learn: the agent (ReAct) loop.*
- [x] **2.5** `list_bookings` (by date and status), wrapping `listTrips`. *Learn: reusing code, keeping tool output small.*
- [x] **2.6** `get_booking` (by VB number).
- [x] **2.7** `search_bookings` (name, phone, number).
- [x] **2.8** `balances_due` (totals from `outstanding()`, the Expense Tracker overview's own SQL).
- [x] **2.9** Vehicle and driver summary tools (`vehicle_summary`, `driver_summary`: all-time, or one month).
- [x] **2.10** `month_overview` (money in, money out, profit).
- [x] **2.11** `print_orders` (orders waiting).
- [x] **2.12** "Checked bookings…" chips while a tool runs (the route now sends NDJSON events: text and step). *Learn: streaming graph events, not just text.*
- [x] **2.13** Booking table card rendered from a tool's result (`lib/assistant/cards.ts`, from the artifact; list, search, balances due). *Learn: structured replies.*
- [x] **2.14** Step limit to stop runaway loops (4 tool rounds, then an answer with no tools offered; hard limit of 11 steps). *Learn: loop safety.*
- [x] **2.15** Treat tool results as data, never instructions (`freeText()` cleans typed fields; `toolReply()` flags instruction-like text; prompt "Tool results" rules; tested with 4 attacks: 0 followed, 3 of 3 warned). *Learn: prompt-injection defence.*
- [x] **2.16** Tests: the fake model makes scripted tool calls (`[tool:name {…}]`, `[loop]`); check the right tool runs, its chip and card, and the round limit.

## Step 3 — Reports

- [x] **3.1** `report` tool (bookings, customers, drivers, vehicles or all, for a month): headline numbers + a link to the existing PDF download (the app has PDFs, not CSV).
- [x] **3.2** File card with a Download button (and a View link to the report's page; the prompt says never to write links).
- [x] **3.3** "Last month" / "September" → a checked `YYYY-MM` value (`lib/assistant/months.ts`: month tools take the admin's words, our code works out the month).
- [x] **3.4** Expense statement tool: link to a booking's existing PDF (`expense_statement`, same rules as the booking page's button).

## Step 4 — Creating data, with your confirmation

- [x] **4.1** Move the booking checks into `lib/expenses/tripInput.ts`, shared by the form and the assistant (`parseTrip`, `checkTrip`; old and new compared on 33 inputs; new browser test of the form). *Learn: reuse.*
- [x] **4.2** `draft_booking` tool: validate, match vehicle/driver names, check they're free. **Saves nothing.** (`lib/assistant/match.ts`, `tools/drafts.ts`; asks for everything missing at once; our code finds states and counts days.)
- [x] **4.3** Unclear names ("Ravi" matches two drivers) → the assistant asks which one. (Every unclear name and place asked in one question, with the choices; drivers with the same name told apart by phone; the model never chooses.)
- [x] **4.4** Confirmation card (as in the mockup). (Built from the tool's checked values in `cards.ts`; a busy driver booked anyway is a warning on it; Confirm says plainly it saves nothing until 4.6; the mockup's fake save removed.)
- [x] **4.5** `assistant_drafts` table (owner, expiry); the card only carries an ID. *Learn: never trust data from the browser.* (`lib/assistant/draftStore.ts`: `saveDraft`, `getDraft` for the owner only; the admin's id comes from the session via `configurable`; drafts last 24 hours.)
- [x] **4.6** Confirm button → server action re-checks, calls `createTrip`, logs "via Assistant". (`app/admin/assistant/actions.ts`; the draft is claimed in one statement so it saves once; form and Confirm both save through `createCheckedTrip`; a failed save puts the draft back to pending.)
- [x] **4.7** After confirming, the result goes back into the chat so the conversation continues. (The chat sends its cards' draft ids with the history; the server adds what became of each, from the database: "[After this answer: … saved as VB-0042.]"; notes typed by the browser are removed; fake `[history]` tag to test it.)
- [x] **4.8** "Open in booking form" → the create form, filled in from the draft. (`/admin/expenses/bookings/new?draft=<id>` loads it on the server for its owner; saving the form uses the draft up the way Confirm does, so a draft becomes one booking only; logged "from an Annapurna Assist draft".)
- [x] **4.9** Payment draft: tool, card, confirm. (`draft_payment` in `tools/payments.ts`: the booking by number or customer name, with choices; payment checks and saving shared with the booking page in `lib/expenses/paymentInput.ts`; Confirm saves it once, logged "via Annapurna Assist".)
- [x] **4.10** Fuel draft: tool, card, confirm. (`draft_fuel` in `tools/fuel.ts`: on a booking or straight on a vehicle; warns about an odd price per litre; fuel checks and saving shared with the fuel form in `lib/expenses/fuelInput.ts`; booking lookup shared with payments in `tools/findBooking.ts`.)
- [x] **4.11** Drafts can be cancelled and expire. (Cancel is a server action; a draft found saved, cancelled or expired updates its card; a save that broke off halfway is reported, never retried; settled or expired drafts are deleted after 30 days.)
- [x] **4.12** Tests: a draft never writes; confirm writes exactly once, even on a double-click. (`tests/drafts.spec.ts`, no browser, own database: the draft tools change nothing, five Confirms at once save one, owner/cancelled/expired refused, a failed save half-saves nothing; Confirm's code moved to `lib/assistant/confirm.ts` so it can be tested. Checked by breaking the claim on purpose: the test caught the payment saved five times.)

## Step 5 — Saved conversations

- [x] **5.1** `assistant_chats` and `assistant_messages` tables in `db/schema.sql`. *Learn: schema design.* (`lib/assistant/chatStore.ts`: every function takes the admin and only touches their chats; the chat id is a UUID made by the browser; tests in `tests/chats.spec.ts`.)
- [x] **5.2** Save each turn, including tool calls. (The question once counted, the answer when it ends, however it ends: words, chips, cards, the tools called, stopped/error. The browser sends only the question and the chat id; the history is read from the saved chat, `lib/assistant/history.ts`; another admin's chat id gets 404.)
- [x] **5.3** `/admin/assistant/[chatId]` loads an old chat. (`lib/assistant/openChat.ts`: only for its owner, others get 404; draft cards show their status from `assistant_drafts`; on the full page the address follows the open chat, so a reload or a bookmark opens it again.)
- [x] **5.4** History sidebar (your own chats only). (Titles from the database in the admin layout; a chat's messages load when it's opened, `loadChat` server action; the first question is the first title; `sample.ts` deleted.)
- [x] **5.5** Flash-Lite gives each chat a title from its first question. (`lib/assistant/titles.ts`: alongside the answer, in the question's language, tidied by `cleanTitle`; saved as written, sent as a `title` event; the answer waits for it at most 1.5 s; if it fails the first question stays. Real check: English, Telugu and Hindi titles, 1–7 s.)
- [x] **5.6** Rename and delete chats. (Server actions `renameChat` and `removeChat`, owner only; rename in place in the chat list, Enter saves, Escape cancels; a title says who named it, so Flash-Lite's late title never replaces the admin's name; delete removes the messages too.)
- [x] **5.7** Trim long chats to a token budget. *Learn: context windows.* (`lib/assistant/history.ts`: the newest whole turns that fit 6,000 estimated tokens, UTF-8 bytes / 4; the newest always kept; the prompt says how many older ones were left out.)
- [x] **5.8** Search chats. (`searchChats` on the server through titles and messages, owner only, any case, `%` and `_` typed as plain characters; results with the matching words; the list filters titles as you type until the server answers.)
- [x] **5.9** *(Optional)* Compare with LangGraph's Postgres checkpointer. (`docs/assistant-checkpointer.md`, with `tests/checkpointer.spec.ts` running our real graph with `MemorySaver`: it remembers a thread by itself but resends everything, tool results included; we keep our own tables for control over what's resent, privacy, and the chat list; a checkpointer would earn its place with `interrupt()` in long multi-step runs.)

## Step 6 — RAG (help and knowledge)

- [x] **6.1** Write the knowledge base in `knowledge/` (how-to guides, business info, glossary). (ten guides in `knowledge/`, about 8,700 words, checked against the code: bookings, payments, fuel and expenses, fleet, reports, printouts, users and roles, the assistant, business info, glossary; one `##` section per topic, each readable on its own)
- [x] **6.2** Embed one sentence with `gemini-embedding-2` (same key) and print the vector. *Learn: what an embedding is.* (`npm run kb:embed`: 768 numbers, about 0.6 s, already scaled to length 1. `lib/assistant/kb/embeddings.ts` wraps Google's REST API in LangChain's `Embeddings` class (`@langchain/google` has none yet), with a free fake for tests. `scripts/ts-paths.mjs` lets plain Node run the app's TypeScript from scripts)
- [x] **6.3** Compare 3 sentences with cosine similarity. *Learn: the intuition behind vector search.* (`npm run kb:compare`: "add diesel for a trip" and "recording a fuel entry" score 0.79 with no words in common, an unrelated weather question 0.45; real scores bunch together, so search takes the closest few rather than a fixed cut-off)
- [x] **6.4** `CREATE EXTENSION vector` and a `kb_chunks` table. (`kb_chunks` in `db/schema.sql` with a `vector(768)` column. PGlite loads pgvector from `@electric-sql/pglite-pgvector` 0.0.9 (the one built for PGlite 0.5.8); Docker moves to `pgvector/pgvector:0.8.6-pg17`, tried on a throwaway container; run `npm run db:fresh` once after switching)
- [x] **6.5** Split documents by heading. *Learn: chunking trade-offs.* (`lib/assistant/kb/chunks.ts`: one chunk per `##` section, starting with "Guide › Section" so a short step still says what it is about; a section over 2,000 characters is split at its paragraphs; the ten guides make 104 chunks, the longest 841 characters)
- [x] **6.6** `npm run kb:ingest`: embed and save chunks, skip unchanged ones. (`lib/assistant/kb/ingest.ts` and `scripts/kb-ingest.ts`: compares fingerprints and embeds only new or changed sections (one request per 100), moves sections that only changed place, deletes ones that are gone; the browser tests ingest with the fake embeddings)
- [x] **6.7** Vector search: `ORDER BY embedding <=> $1 LIMIT 5`. (`lib/assistant/kb/search.ts`: embeds the question as a query, `ORDER BY embedding <=> $1 LIMIT 5`, score = 1 − distance)
- [x] **6.8** HNSW index. *Learn: approximate search.* (an HNSW index with `vector_cosine_ops` on `kb_chunks.embedding`; with a hundred rows Postgres still reads the whole table, so the test turns that off to see the planner pick the index)
- [x] **6.9** `search_help` tool. (`lib/assistant/tools/help.ts`: the closest sections scoring at least 0.5 (Gemini) go to the model, otherwise "none"; help text isn't checked for instructions (`toolReply(…, { ownText: true })`) and isn't business data; prompt rules: answer only from the sections, never describe screens from memory. Real check: "record diesel for a trip" and a Telugu "how do I add a user" each found the right section first (0.78, 0.74))
- [x] **6.10** Answers say which guide they came from. (a sources card under the answer (each guide once, its sections in the tooltip) made from the tool's own result, and the model ends with "(From the … guide.)")
- [x] **6.11** Retrieval eval: 20 questions → expected guide; measure recall@3. (`npm run kb:eval` on 30 questions in `evals/retrieval.jsonl` (20 plain, 10 hard, two in Telugu and Hindi): recall@3 **100%**, recall@1 97%, MRR 0.98 with Gemini; the word-matching fake gets 67% / 43% / 0.56. Notes in `docs/assistant-rag.md`)
- [x] **6.12** Try two chunk sizes; record which works better. (whole sections (up to 2,000 characters, 104 chunks) vs pieces of up to 300 (174): the same recall (97% / 100%), MRR 0.983 vs 0.978; kept whole sections: complete steps for the model, 70% fewer embeddings; `docs/assistant-rag.md`)
- [x] **6.13** *(Optional)* Hybrid keyword + vector search. (Postgres full-text search (`kb_chunks.words`, GIN) merged with the vector search by reciprocal rank fusion: MRR 0.87 against vector's 0.98 (keywords alone 0.64): common words like "booking" add noise, and Telugu and Hindi find nothing, so `search_help` stays vector-only; `docs/assistant-rag.md`)

## Step 7 — Voice

- [x] **7.1** Show the mic only where the browser supports speech recognition. (built with the mockup (`Composer.tsx`): the mic is checked for in the browser after the first render; where speech recognition is missing (Firefox), blocked (Brave) or the page isn't secure, the mic is greyed out but still tappable, to say why instead of doing nothing. `tests/voice.spec.ts` replaces the browser's speech recognition with one the test drives)
- [x] **7.2** Mic button: start/stop, words appear live in the box. (interim results: each result replaces the words heard so far, after what was already typed; tested)
- [x] **7.3** Language picker: English, Telugu, Hindi. (EN / TE / HI menu, Telugu by default; the browser is told `en-IN`, `te-IN` or `hi-IN`; tested)
- [x] **7.4** Listening animation; message if mic permission is denied. (a red box and a pulsing ring round the mic while listening; each browser error code in plain words, e.g. "not-allowed" says how to allow the mic; tested)
- [x] **7.5** Choose: send automatically, or edit first. (a "Send when I stop talking" switch in the language menu, off by default (speech-to-text gets names and numbers wrong, so checking first is safer); remembered in this browser; tested)
- [ ] **7.6** Test on a real phone using the deployed HTTPS URL (the mic doesn't work on `http://192.168…`). *Learn: secure contexts.* (Not done yet: it needs the site online over HTTPS (10.1) and a real phone. On an insecure page the mic already says why it can't listen, from the mockup.)
- [x] **7.7** Reply in the language you spoke. (the chat sends the mic's language with a spoken question (`lib/assistant/voice.ts`); the route accepts only en-IN, te-IN or hi-IN, only for a spoken question, and the prompt says to reply in it, in its own script, even if speech-to-text mixed in English words. Real check: Telugu typed in English letters ("nuvvu emi cheyagalavu") got a Telugu reply with and without the line, so it's a safeguard; tested)

## Step 8 — Evals, cost and tracing

- [x] **8.1** Usage table: tokens, cost, response time per request. (`assistant_requests`, one row per question: every model call (answer, off-topic check, title) with its model, input, output, cached and thinking tokens, the tools called, the outcome, time to the first word and to the end. A LangChain callback handler (`UsageRecorder`, `lib/assistant/requestLog.ts`) hears every call, however deep in the graph. Real check: a date question made two calls of about 5,500 input tokens each; the second had 2,009 cached)
- [x] **8.2** Cost calculator: what each question would cost in rupees on a paid model (price table). (`lib/assistant/prices.ts`: paid Standard prices from Google's pricing page on 18 Nov 2026 (Flash-Lite $0.30 in, $0.03 cached, $2.50 out per 1M; 3.8 Flash $0.75 / $0.075 / $3.75, doubling on 1 Jan 2027), priced by the day of the question; ₹95 to the dollar as an assumption (`ASSISTANT_USD_INR`). The date question from 8.1 would cost about ₹0.27; tested)
- [x] **8.3** Usage page for super admin. (`/admin/assistant/usage` (`viewAssistantUsage`: super admin only), linked from the chat list and the header: the last 30 days' questions, would-be cost, tokens (with the cached share) and answer times; where the tokens go (answers, off-topic check, titles), by admin, by day, and the latest 25 questions (not their text); tested)
- [x] **8.4** First 20 cases in `evals/cases.jsonl`: question → expected tool and inputs. (`evals/cases.jsonl`: 20 questions across bookings, money, fleet, prints, dates, drafts, help, chat and the off-topic check, each with the tools and inputs it should lead to; months and dates by meaning ("last month", tomorrow))
- [x] **8.5** Eval runner: tool choice only, against a test database. (`npm run eval:setup` makes `.data/pglite-eval` (tables, sample data, help guides, an eval admin); `npm run eval` runs the real graph and tools on it for each case, grades every tool call, paces itself under the free tier's per-minute limit, records the model's turns for replay. `buildGraph` takes a model. First run: 20/20 on Flash-Lite)
- [x] **8.6** Code graders: compare tool and inputs (free). (`evals/graders.ts`: the right tools (any order, extra calls allowed), inputs by value, by part (`$contains`), by meaning (`$month`, `$date`), or any/absent; no tools, forbidden tools, words the answer must or mustn't have, the off-topic verdict; "right tool, wrong input" counted apart from "wrong tool"; tested)
- [x] **8.7** Run report: accuracy, cost, time; saved to a file. (each run prints and saves `evals/results/tools-<model>.json`: accuracy, right tools, accuracy by tag, seconds a case (pacing waits not counted), requests, tokens in/cached/out, paid-tier cost, failures with reasons, every case's calls and answer. First 20 on Flash-Lite: 100%, 3.3 s a case, 40 requests, ₹5.12; `docs/assistant-evals.md`)
- [x] **8.8** Grow to 100 cases, including off-topic and prompt-injection cases. (100 cases in `evals/cases.jsonl`: harder wordings, Telugu and Hindi, two-tool questions, 12 off-topic-check cases and 8 prompt injections, one planted in a booking's notes in the eval database. Flash-Lite: 99/100, then 100 after fixing a case that failed a correct answer; every injection held; 7.5 s and ₹0.24 a question at paid prices. The runner now saves after each case, resumes, retries errors, and counts an off-topic check that never answered as an error; `docs/assistant-evals.md`)
- [x] **8.9** Flash-Lite judges answer quality on a small subset. (`npm run eval:judge`: Flash-Lite scores 12 answers (correct, complete, style) with the tool results replayed on the eval database: 12/12 good, and it caught both answers spoiled on purpose (a made-up total, English for a Telugu question). Its first try wrongly failed a help answer: the judge itself used the wrong embeddings)
- [ ] **8.10** Compare two models on the same cases (e.g. Gemini Flash vs Flash-Lite, or a free Groq model).
- [ ] **8.11** Check caching works (Gemini reports cached tokens in the usage).
- [ ] **8.12** CI: the fake-model eval set on every push (free).
- [ ] **8.13** *(Optional)* LangSmith tracing.
- [ ] **8.14** *(Optional)* Rewrite the eval runner in Python.

## Step 9 — Privacy-first mode (before real data or production)

The model never sees database data; it only chooses tools. Trade-offs: no open-ended analysis of the data,
follow-ups need row labels, sentences with numbers come from our code. (Design decision 6.)

- [x] **9.1** Choose how strict: only "shown to the admin", **status** (found / none / too many / failed, recommended), (**status**, as recommended: the model gets found / none / too many / failed, row counts, row and booking numbers, trip statuses and dates, missing field names and our own fixed notes; never names, phones, amounts, notes or file names. Booking numbers stay: not personal, and they make follow-ups work. `docs/assistant-privacy.md`)
      or non-personal totals too.
- [x] **9.2** `ASSISTANT_PRIVACY=strict`: tools return LangChain's `content_and_artifact`. The model gets the (one place, after the tools run: the graph's tools node swaps each ToolMessage's content for `strictContent` (`lib/assistant/privacy.ts`) and keeps the artifact for the cards, so no tool was rewritten. In strict mode every tool has a card (booking, month, vehicles, drivers, printouts), and a draft that isn't ready gets a card saying why; the model gets fixed notes we wrote. Tested both ways on a booking with a name, phone and total to spot)
      status, the screen gets the rows. *Learn: separating what the model sees from what the user sees.*
- [x] **9.3** No database values in the prompt (e.g. the admin's first name from 1.5 is left out in this mode). (in strict mode the admin's first name is left out, and a "Privacy mode (on)" section after the fixed rules (so the cached start stays the same) says the details are on cards it can't see and never to guess them; tested)
- [x] **9.4** Anonymous row labels ("result A, row 2") so follow-ups like "call the second one" still work. (rows numbered 1, 2, 3… with their booking or printout numbers (not personal: the business's own reference numbers), the same numbers in a # column of the table card in strict mode, and the prompt says to use row 2's booking number for "the second one"; tested)
- [x] **9.5** Drafts: the customer's name and phone are typed into the card, not the chat. (in strict mode `draft_booking` doesn't ask for them: the form's other checks run with stand-ins and the draft keeps them empty; the card has two boxes (sent only to our server action), Confirm stays off until both are filled, and `confirmDraftAs` checks them with the booking form's own rules; the prompt says to leave them out; tested)
- [x] **9.6** A note under the chat box: what you type or say is sent to Google (voice uses Google's speech service). (replaces the old "Gemini can't see your data yet" (untrue since Step 2): normal mode says what you type or say and what the assistant looks up goes to Google; privacy mode says your data stays here and only what you type or say goes; the hover text adds that voice uses Google's speech service; tested)
- [ ] **9.7** Test: run every eval question in strict mode and check that no name, phone or amount from the
      database appears in any request sent to Google. *Learn: testing for data leaks.*
- [ ] **9.8** Compare the two modes on the evals (Step 8): what still works, what doesn't.

## Step 10 — Ship and show

- [ ] **10.1** *(Only if it goes online)* API key in Vercel's environment settings, privacy-first mode on.
- [ ] **10.2** README section with an architecture diagram and the decisions made.
- [ ] **10.3** Demo mode on sample data + a 2-minute video.
