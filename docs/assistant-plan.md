# AI Assistant — build plan

An admin-only AI assistant inside the Annapurna admin: a chat page (text and voice) that answers
questions from live data, creates bookings / payments / fuel entries after you confirm, gives the
monthly report, and answers "how do I…" questions from a small knowledge base.

**Name:** not decided yet. The code uses "Assistant" until then.
Shortlist: PurnaAI · Annapurna AGI · PadmaAI · SevaAI · Annapurna Assist.

## How we work

- One task at a time. Each task changes one or two files and teaches one idea.
- For every task: make the change → explain every line → you try it → commit when you say so.
- Tick the box when a task is done.

## Stack

| Part | Choice |
|---|---|
| Language | TypeScript (same as the rest of the app) |
| Agent | LangGraph (`@langchain/langgraph`) |
| Main model | Claude Sonnet 5.5 (`claude-sonnet-5-5`) via `@langchain/anthropic` |
| Cheap model (off-topic check, chat titles, AI judge) | Claude Haiku 4.5 (`claude-haiku-4-5`) |
| Live data | Tools that call the existing functions in `lib/` (never raw SQL from the model) |
| RAG | pgvector on the existing Neon database, Voyage AI embeddings |
| Voice | The browser's speech recognition (en-IN, te-IN, hi-IN) |
| Tests | Playwright + a fake model (`ASSISTANT_FAKE=1`), so tests are free and repeatable |

## Design decisions

1. **Admins only.** `useAssistant: ["super_admin", "admin"]`, checked on the server for the page, the API route and every tool.
2. **The model never writes data.** Write tools only make a *draft* (saved server-side with an owner and an
   expiry). The confirmation card's button runs a server action that re-checks everything and uses the same
   code as the forms. Activity shows "via Assistant".
3. **Exact numbers come from tools, not RAG.** RAG is only for help text, business info and the glossary.
4. **Tool results are data, not instructions** (booking notes and names can't steer the assistant).
5. **Guardrails:** scope rules in the prompt + a cheap off-topic check + message length limit + daily cap per admin.

## Cost (estimates)

- About ₹2 per question on Sonnet 5.5 with prompt caching → roughly ₹1,000–2,500 a month for 2–3 admins.
- Evals: about ₹35 per 100-case tool-choice run, ₹200–250 per full run; roughly ₹400–1,000 for the whole project.
- Start with $10 prepaid credit and a monthly spend limit in the Anthropic Console.

---

## Step 0 — Setup (outside the app)

- [ ] **0.1** Create an Anthropic account, add $10 credit, set a spend limit, create an API key. *Learn: billing, keys.*
- [ ] **0.2** Put the key in `.env.local` as `ANTHROPIC_API_KEY` (never commit it). *Learn: secrets stay server-side.*
- [ ] **0.3** `npm i @langchain/anthropic @langchain/core`. *Learn: what each package does.*
- [ ] **0.4** `scripts/ai-hello.mjs`: ask one question, print the reply and token counts. *Learn: a model call, tokens.*
- [ ] **0.5** Add a system message to the script. *Learn: system vs user messages.*
- [ ] **0.6** Print the reply word by word. *Learn: streaming.*

## Step 1 — Chat page (no tools yet)

- [ ] **1.1** Add the `useAssistant` permission in `lib/auth.ts`. *Learn: role checks.*
- [ ] **1.2** Add "Assistant" to `components/admin/Sidebar.tsx`, shown only to admins.
- [ ] **1.3** `app/admin/assistant/page.tsx`: an admin-only page that says hello. *Learn: protecting a route.*
- [ ] **1.4** `lib/assistant/model.ts`: model name and settings in one place.
- [ ] **1.5** `lib/assistant/prompt.ts`: rules, scope, today's date in IST.
- [ ] **1.6** `app/api/assistant/route.ts`: check login, call the model, return the full reply. *Learn: model calls stay on the server.*
- [ ] **1.7** `components/assistant/Chat.tsx`: message list, input box, Send button.
- [ ] **1.8** The route streams the reply in chunks.
- [ ] **1.9** The UI shows words as they arrive.
- [ ] **1.10** Send earlier messages with each request. *Learn: the model remembers nothing between calls.*
- [ ] **1.11** Styles in `app/admin.css` (bubbles, message box), matching the mockup.
- [ ] **1.12** Errors (API down, rate limit) and a Stop button. *Learn: cancelling a request mid-reply.*
- [ ] **1.13** Guardrail v1: scope rules in the prompt; try off-topic questions by hand.
- [ ] **1.14** Guardrail v2: `lib/assistant/guard.ts`, a Haiku check before the main model. *Learn: routing to a cheaper model.*
- [ ] **1.15** Maximum message length and a daily question cap per admin. *Learn: preventing abuse.*
- [ ] **1.16** Fake model for tests (`ASSISTANT_FAKE=1`). *Learn: testing AI code without paying or random results.*
- [ ] **1.17** Playwright test: a viewer can't open the page; an admin can chat.

## Step 2 — LangGraph and read-only tools

- [ ] **2.1** `npm i @langchain/langgraph`.
- [ ] **2.2** Smallest graph: START → model → END. *Learn: state, nodes, edges.*
- [ ] **2.3** First tool `get_today`. *Learn: tool definition with a zod schema.*
- [ ] **2.4** Tool loop: model → tools → model until done. *Learn: the agent (ReAct) loop.*
- [ ] **2.5** `list_bookings` (by date and status), wrapping `listTrips`. *Learn: reusing code, keeping tool output small.*
- [ ] **2.6** `get_booking` (by VB number).
- [ ] **2.7** `search_bookings` (name, phone, number).
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
- [ ] **5.5** Haiku gives each chat a title from its first question.
- [ ] **5.6** Rename and delete chats.
- [ ] **5.7** Trim long chats to a token budget. *Learn: context windows.*
- [ ] **5.8** Search chats.
- [ ] **5.9** *(Optional)* Compare with LangGraph's Postgres checkpointer.

## Step 6 — RAG (help and knowledge)

- [ ] **6.1** Write the knowledge base in `knowledge/` (how-to guides, business info, glossary).
- [ ] **6.2** Voyage key; embed one sentence and print the vector. *Learn: what an embedding is.*
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
- [ ] **8.2** Cost calculator (rupees from a price table).
- [ ] **8.3** Usage page for super admin.
- [ ] **8.4** First 20 cases in `evals/cases.jsonl`: question → expected tool and inputs.
- [ ] **8.5** Eval runner: tool choice only, against a test database.
- [ ] **8.6** Code graders: compare tool and inputs (free).
- [ ] **8.7** Run report: accuracy, cost, time; saved to a file.
- [ ] **8.8** Grow to 100 cases, including off-topic and prompt-injection cases.
- [ ] **8.9** Haiku judges answer quality on a small subset.
- [ ] **8.10** Compare Claude vs GPT vs Gemini on the same cases.
- [ ] **8.11** Check prompt caching works (`cache_read` tokens above 0).
- [ ] **8.12** CI: small eval set on every push, with a budget cap.
- [ ] **8.13** *(Optional)* LangSmith tracing.
- [ ] **8.14** *(Optional)* Rewrite the eval runner in Python.

## Step 9 — Ship and show

- [ ] **9.1** API key in Vercel's environment settings; monthly spend limit.
- [ ] **9.2** README section with an architecture diagram and the decisions made.
- [ ] **9.3** Demo mode on sample data + a 2-minute video.
