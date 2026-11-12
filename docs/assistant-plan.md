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
- [ ] **2.8** `balances_due`.
- [ ] **2.9** Vehicle and driver summary tools.
- [ ] **2.10** `month_overview` (money in, money out, profit).
- [ ] **2.11** `print_orders` (orders waiting).
- [ ] **2.12** "Checked bookings…" chips while a tool runs. *Learn: streaming graph events, not just text.*
- [ ] **2.13** Booking table card rendered from a tool's result. *Learn: structured replies.*
- [ ] **2.14** Step limit to stop runaway loops. *Learn: loop safety.*
- [ ] **2.15** Treat tool results as data, never instructions. *Learn: prompt-injection defence.*
- [ ] **2.16** Tests: the fake model makes scripted tool calls; check the right tool runs.

## Step 3 — Reports

- [ ] **3.1** `report` tool (bookings, drivers or repairs, for a month): counts + a link to the existing CSV download.
- [ ] **3.2** File card with a Download button.
- [ ] **3.3** "Last month" / "September" → a checked `YYYY-MM` value.
- [ ] **3.4** Expense statement tool: link to a booking's existing PDF.

## Step 4 — Creating data, with your confirmation

- [ ] **4.1** Move the booking checks into `lib/expenses/tripInput.ts`, shared by the form and the assistant. *Learn: reuse.*
- [ ] **4.2** `draft_booking` tool: validate, match vehicle/driver names, check they're free. **Saves nothing.**
- [ ] **4.3** Unclear names ("Ravi" matches two drivers) → the assistant asks which one.
- [ ] **4.4** Confirmation card (as in the mockup).
- [ ] **4.5** `assistant_drafts` table (owner, expiry); the card only carries an ID. *Learn: never trust data from the browser.*
- [ ] **4.6** Confirm button → server action re-checks, calls `createTrip`, logs "via Assistant".
- [ ] **4.7** After confirming, the result goes back into the chat so the conversation continues.
- [ ] **4.8** "Open in booking form" → the create form, filled in from the draft.
- [ ] **4.9** Payment draft: tool, card, confirm.
- [ ] **4.10** Fuel draft: tool, card, confirm.
- [ ] **4.11** Drafts can be cancelled and expire.
- [ ] **4.12** Tests: a draft never writes; confirm writes exactly once, even on a double-click.

## Step 5 — Saved conversations

- [ ] **5.1** `assistant_chats` and `assistant_messages` tables in `db/schema.sql`. *Learn: schema design.*
- [ ] **5.2** Save each turn, including tool calls.
- [ ] **5.3** `/admin/assistant/[chatId]` loads an old chat.
- [ ] **5.4** History sidebar (your own chats only).
- [ ] **5.5** Flash-Lite gives each chat a title from its first question.
- [ ] **5.6** Rename and delete chats.
- [ ] **5.7** Trim long chats to a token budget. *Learn: context windows.*
- [ ] **5.8** Search chats.
- [ ] **5.9** *(Optional)* Compare with LangGraph's Postgres checkpointer.

## Step 6 — RAG (help and knowledge)

- [ ] **6.1** Write the knowledge base in `knowledge/` (how-to guides, business info, glossary).
- [ ] **6.2** Embed one sentence with `gemini-embedding-2` (same key) and print the vector. *Learn: what an embedding is.*
- [ ] **6.3** Compare 3 sentences with cosine similarity. *Learn: the intuition behind vector search.*
- [ ] **6.4** `CREATE EXTENSION vector` and a `kb_chunks` table.
- [ ] **6.5** Split documents by heading. *Learn: chunking trade-offs.*
- [ ] **6.6** `npm run kb:ingest`: embed and save chunks, skip unchanged ones.
- [ ] **6.7** Vector search: `ORDER BY embedding <=> $1 LIMIT 5`.
- [ ] **6.8** HNSW index. *Learn: approximate search.*
- [ ] **6.9** `search_help` tool.
- [ ] **6.10** Answers say which guide they came from.
- [ ] **6.11** Retrieval eval: 20 questions → expected guide; measure recall@3.
- [ ] **6.12** Try two chunk sizes; record which works better.
- [ ] **6.13** *(Optional)* Hybrid keyword + vector search.

## Step 7 — Voice

- [ ] **7.1** Show the mic only where the browser supports speech recognition.
- [ ] **7.2** Mic button: start/stop, words appear live in the box.
- [ ] **7.3** Language picker: English, Telugu, Hindi.
- [ ] **7.4** Listening animation; message if mic permission is denied.
- [ ] **7.5** Choose: send automatically, or edit first.
- [ ] **7.6** Test on a real phone using the deployed HTTPS URL (the mic doesn't work on `http://192.168…`). *Learn: secure contexts.*
- [ ] **7.7** Reply in the language you spoke.

## Step 8 — Evals, cost and tracing

- [ ] **8.1** Usage table: tokens, cost, response time per request.
- [ ] **8.2** Cost calculator: what each question would cost in rupees on a paid model (price table).
- [ ] **8.3** Usage page for super admin.
- [ ] **8.4** First 20 cases in `evals/cases.jsonl`: question → expected tool and inputs.
- [ ] **8.5** Eval runner: tool choice only, against a test database.
- [ ] **8.6** Code graders: compare tool and inputs (free).
- [ ] **8.7** Run report: accuracy, cost, time; saved to a file.
- [ ] **8.8** Grow to 100 cases, including off-topic and prompt-injection cases.
- [ ] **8.9** Flash-Lite judges answer quality on a small subset.
- [ ] **8.10** Compare two models on the same cases (e.g. Gemini Flash vs Flash-Lite, or a free Groq model).
- [ ] **8.11** Check caching works (Gemini reports cached tokens in the usage).
- [ ] **8.12** CI: the fake-model eval set on every push (free).
- [ ] **8.13** *(Optional)* LangSmith tracing.
- [ ] **8.14** *(Optional)* Rewrite the eval runner in Python.

## Step 9 — Privacy-first mode (before real data or production)

The model never sees database data; it only chooses tools. Trade-offs: no open-ended analysis of the data,
follow-ups need row labels, sentences with numbers come from our code. (Design decision 6.)

- [ ] **9.1** Choose how strict: only "shown to the admin", **status** (found / none / too many / failed, recommended),
      or non-personal totals too.
- [ ] **9.2** `ASSISTANT_PRIVACY=strict`: tools return LangChain's `content_and_artifact`. The model gets the
      status, the screen gets the rows. *Learn: separating what the model sees from what the user sees.*
- [ ] **9.3** No database values in the prompt (e.g. the admin's first name from 1.5 is left out in this mode).
- [ ] **9.4** Anonymous row labels ("result A, row 2") so follow-ups like "call the second one" still work.
- [ ] **9.5** Drafts: the customer's name and phone are typed into the card, not the chat.
- [ ] **9.6** A note under the chat box: what you type or say is sent to Google (voice uses Google's speech service).
- [ ] **9.7** Test: run every eval question in strict mode and check that no name, phone or amount from the
      database appears in any request sent to Google. *Learn: testing for data leaks.*
- [ ] **9.8** Compare the two modes on the evals (Step 8): what still works, what doesn't.

## Step 10 — Ship and show

- [ ] **10.1** *(Only if it goes online)* API key in Vercel's environment settings, privacy-first mode on.
- [ ] **10.2** README section with an architecture diagram and the decisions made.
- [ ] **10.3** Demo mode on sample data + a 2-minute video.
