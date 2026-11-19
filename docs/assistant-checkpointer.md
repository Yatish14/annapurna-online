# Saved chats vs LangGraph's checkpointer (task 5.9)

Step 5 saves Annapurna Assist's chats in two tables of our own (`assistant_chats`, `assistant_messages`,
`lib/assistant/chatStore.ts`). LangGraph has its own way to remember conversations: a **checkpointer**. This note
compares the two, with a runnable test: `tests/checkpointer.spec.ts` compiles our real graph with LangGraph's
`MemorySaver` (`buildGraph(maxRounds, checkpointer)` in `lib/assistant/graph.ts`).

## What a checkpointer does

You compile the graph with one (`.compile({ checkpointer })`) and call it with a `thread_id`:

```ts
const graph = buildGraph(undefined, new MemorySaver()); // or PostgresSaver, same interface
await graph.invoke({ messages: [new HumanMessage("What's the date?")] }, { configurable: { thread_id: chatId } });
await graph.invoke({ messages: [new HumanMessage("And tomorrow?")] }, { configurable: { thread_id: chatId } });
```

The second call passes only the new question, but the graph sees the whole conversation: after **every step** (the
model's turn, the tools' turn…) the checkpointer saves the graph's full state, and the next call with the same
`thread_id` starts from the last one. `@langchain/langgraph-checkpoint-postgres` (`PostgresSaver`) does the same in
Postgres tables it creates and manages itself (`await checkpointer.setup()`).

The test shows the three things that matter here:

- **It remembers by itself.** The second question was sent alone, and the fake model reported "Earlier questions
  in this chat: 1". Without the checkpointer it says 0 (the test was run that way once to make sure it can fail).
- **It keeps everything**: `human, ai, human, ai (tool call), tool, ai`. The tool's whole result is in there
  (`"status":"found"…`), and a ToolMessage also carries its `artifact`: for our tools, the database rows behind a
  card.
- **It keeps a checkpoint per step**, not a row per message: 6 or more for two questions. That's what makes replay
  ("time travel") and resuming possible.

## Side by side

| | Our saved chats (Step 5) | LangGraph checkpointer |
|---|---|---|
| What's saved | What the chat showed: words, chips, cards, the tools called and their inputs | The graph's full state after every step: all messages, tool calls, tool results and artifacts |
| History sent to the model | Built by us (`lib/assistant/history.ts`): failed replies left out, whole pairs, **trimmed to a token budget** (5.7), draft notes from `assistant_drafts` (4.7) | Everything in the thread, every time, unless we add our own trimming (e.g. a node or `trimMessages`) |
| Tool results in later turns | Not sent again: the model re-runs a tool if it needs fresh numbers | Sent again on every question, and stale: "₹12,000 still to pay" from last week reads like a fact |
| Privacy (Step 9: no database data to Google) | We choose what's stored and resent | Tool results and artifacts (customer names, phones, amounts) are stored and resent by default |
| Owner check, list, search, rename, delete | Ours, in SQL (`user_id` on every query) | Not included: a thread id is just a string. We'd still need our own chats table for the list, titles, search and who owns what; deleting means `deleteThread` |
| Replaying a chat on screen | One query; the rows are what the screen shows | Rebuild cards and chips from LangChain messages and artifacts |
| Schema | Ours, in `db/schema.sql`, documented and tested | The library's tables, migrated by `setup()`; changes come with upgrades |
| Pause and resume (`interrupt()`) | Not available: Confirm is our own server action on a draft (4.4–4.6) | **Its strength**: a graph can stop at "wait for the admin's Confirm" and carry on from that exact step later, even after a restart |
| Resume after a crash mid-answer | The answer is saved as stopped; the admin asks again | The run can continue from the last checkpoint |
| Storage | Two rows per question | One checkpoint per step, each with the state so far (grows quickly; needs cleaning up) |

## The decision: keep our own tables

For this assistant, our tables fit better:

1. **We need control over what's resent.** The token budget (5.7), leaving out failed replies, the draft notes and,
   later, privacy-first mode (no database data to Google) all decide what the model sees. A checkpointer resends the
   whole thread unless we rebuild that control on top of it.
2. **Old tool results shouldn't be resent.** Balances and bookings change; our answers keep only the words, and the
   model looks things up again when it needs to.
3. **We'd need our own chats table anyway**, for the chat list, titles, search, rename, delete and "only your own
   chats". The checkpointer would add a second copy of each conversation, in a format the screen can't use directly.
4. **Confirm is already safe without `interrupt()`**: drafts are kept on the server, claimed in one statement and
   checked again (Step 4). There's no long graph run to pause.

**When a checkpointer would be worth it:** long multi-step agents that pause for a human in the middle of a run
(approve step 3 of 7, then carry on), runs that must survive a server restart, or "time travel" debugging of a graph's
steps. If Annapurna Assist grows into that, `PostgresSaver` can be added next to our tables (with our own trimming
and a node that strips tool results before saving), rather than replacing them.
