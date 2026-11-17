import "./unitDb"; // first: the no-browser tests' own throwaway database
import { randomUUID } from "node:crypto";
import { AIMessage, AIMessageChunk, ToolMessage } from "@langchain/core/messages";
import { expect, test } from "@playwright/test";
import { addMessage, chatMessages, chatSummary, ensureChat, listChats, type NewMessage, setTitle } from "@/lib/assistant/chatStore";
import { finishDraft, saveDraft } from "@/lib/assistant/draftStore";
import { historyFor } from "@/lib/assistant/history";
import { savedAs } from "@/lib/assistant/replies";
import { events } from "@/lib/assistant/stream";
import { databaseKind, query } from "@/lib/db";

/**
 * Step 5: Annapurna Assist's saved chats (lib/assistant/chatStore.ts), tested on the code itself, no browser.
 * Each admin only ever sees their own chats. (Adds users and chats, never bookings: drafts.spec.ts, which runs
 * after this file in the same database, expects its own booking to be VB-0001.)
 */

test.describe.configure({ mode: "serial" });

let me: number;
let other: number;

test.beforeAll(async () => {
  expect(databaseKind()).toBe("pglite"); // never anything else
  const ids: number[] = [];
  for (const [mobile, name] of [["9000000301", "Chats Admin"], ["9000000302", "Chats Other"]]) {
    const [u] = await query<{ id: number }>(
      "INSERT INTO users (mobile, name, role, password_hash, created_by) VALUES ($1, $2, 'admin', 'not-a-real-hash', 'tests') RETURNING id::int AS id",
      [mobile, name],
    );
    ids.push(u.id);
  }
  [me, other] = ids;
});

test("a chat is made for the admin who asks, and another admin can't use its id", async () => {
  const id = randomUUID();
  const chat = await ensureChat(id, me);
  expect(chat).toMatchObject({ id, title: "New chat", titled: false, when: "Today" });
  expect(await ensureChat(id, me)).toMatchObject({ id }); // asking again in the same chat
  expect(await ensureChat(id, other)).toBeNull(); // someone else's id
  for (const bad of ["not-an-id", "1 OR 1=1", ""]) expect(await ensureChat(bad, me)).toBeNull();
});

test("messages are kept in order, with what the chat showed, and only for the chat's owner", async () => {
  const id = randomUUID();
  await ensureChat(id, me);
  expect(await addMessage(id, me, { role: "user", text: "Which bookings are upcoming?", voice: true })).toBe(true);
  expect(
    await addMessage(id, me, {
      role: "assistant",
      text: "There are 2.",
      steps: [{ label: "Checked upcoming bookings", icon: "bookings" }],
      cards: [{ kind: "stats", title: "Bookings", items: [{ label: "Upcoming", value: "2" }] }],
      toolCalls: [{ name: "list_bookings", args: { status: "upcoming" } }],
    }),
  ).toBe(true);
  expect(await addMessage(id, me, { role: "assistant", text: "Too many…", error: "Too many questions" })).toBe(true);
  // Another admin can't add to it or read it
  expect(await addMessage(id, other, { role: "user", text: "Mine now" })).toBe(false);
  expect(await chatMessages(id, other)).toBeNull();

  const messages = await chatMessages(id, me);
  expect(messages?.map((m) => [m.role, m.text])).toEqual([
    ["user", "Which bookings are upcoming?"],
    ["assistant", "There are 2."],
    ["assistant", "Too many…"],
  ]);
  expect(messages?.[0].voice).toBe(true);
  expect(messages?.[1].steps).toEqual([{ label: "Checked upcoming bookings", icon: "bookings" }]);
  expect(messages?.[1].cards?.[0]).toMatchObject({ kind: "stats", title: "Bookings" });
  expect(messages?.[2].error).toBe("Too many questions");
  expect(messages?.[0].time).toMatch(/^\d{1,2}:\d{2} [ap]m$/); // "10:42 am", India time
  // The tool calls are kept too (for Step 8's evals), though the chat doesn't show them
  const [row] = await query<{ tool_calls: unknown }>("SELECT tool_calls FROM assistant_messages WHERE chat_id = $1 AND text = 'There are 2.'", [id]);
  expect(row.tool_calls).toEqual([{ name: "list_bookings", args: { status: "upcoming" } }]);
});

test("the chat list has only the admin's own chats with messages, newest first", async () => {
  const empty = randomUUID();
  await ensureChat(empty, me); // no messages yet: not listed
  const older = randomUUID();
  const newer = randomUUID();
  for (const id of [older, newer]) {
    await ensureChat(id, me);
    await addMessage(id, me, { role: "user", text: `Question in ${id}` });
  }
  await query("UPDATE assistant_chats SET updated_at = now() - interval '3 days' WHERE id = $1", [older]);
  const mine = await listChats(me);
  const ids = mine.map((c) => c.id);
  expect(ids).not.toContain(empty);
  expect(ids.indexOf(newer)).toBeLessThan(ids.indexOf(older));
  expect(mine.find((c) => c.id === older)?.when).not.toBe("Today");
  expect(await listChats(other)).toEqual([]);
});

test("titles: spaces tidied (letters kept), at most 80 characters, a written title never replaced by a first one", async () => {
  const id = randomUUID();
  await ensureChat(id, me);
  expect(await setTitle(id, me, "  Which   bookings\nare  upcoming?  ", false)).toBe(true);
  expect((await chatSummary(id, me))?.title).toBe("Which bookings are upcoming?");
  expect(await setTitle(id, me, "x".repeat(200), false)).toBe(true);
  expect((await chatSummary(id, me))?.title).toHaveLength(80);
  // Written (by Flash-Lite or the admin): a first title can't replace it, a written one can
  expect(await setTitle(id, me, "Upcoming bookings", true)).toBe(true);
  expect(await setTitle(id, me, "Some first question", false)).toBe(false);
  expect(await chatSummary(id, me)).toMatchObject({ title: "Upcoming bookings", titled: true });
  expect(await setTitle(id, me, "Renamed", true)).toBe(true);
  // Not theirs, or nothing: no change
  expect(await setTitle(id, other, "Mine now", true)).toBe(false);
  expect(await setTitle(id, me, "   ", true)).toBe(false);
  expect((await chatSummary(id, me))?.title).toBe("Renamed");
});

// 5.2: what the route saves. A made-up graph stream (the same [kind, payload] shapes LangGraph sends) goes through
// events() and savedAs() exactly as in app/api/assistant/route.ts.
function graphStream(opts: { failAfterWords?: boolean; failFirst?: boolean; words?: string } = {}) {
  return (async function* () {
    if (opts.failFirst) throw Object.assign(new Error("Fake 429"), { statusCode: 429 });
    yield ["updates", { model: { messages: [new AIMessage({ content: "", tool_calls: [{ id: "c1", name: "balances_due", args: { min: 1 } }] })] } }];
    const row = { no: "VB-0042", customer: "Saved Customer", vehicle: "Test Carens", driver: "Test Driver", dates: "1 Dec", balance: 500 };
    yield ["updates", { tools: { messages: [new ToolMessage({ tool_call_id: "c1", content: "{}", artifact: { status: "found", data: { customer_bookings: 1, bookings_owing: [row] } } })] } }];
    if (opts.words !== "") yield ["messages", [new AIMessageChunk({ content: opts.words ?? "One customer owes ₹500." }), { langgraph_node: "model" }]];
    if (opts.failAfterWords) throw new Error("Google went away");
  })() as AsyncIterable<[string, unknown]>;
}
async function answerFrom(stream: AsyncIterable<[string, unknown]>, signal = new AbortController().signal) {
  const chatId = randomUUID();
  await ensureChat(chatId, me);
  const answer: NewMessage = { role: "assistant", text: "", steps: [], cards: [], toolCalls: [] };
  const pieces = savedAs(events(stream, (call) => answer.toolCalls!.push(call)), answer, (m) => addMessage(chatId, me, m), signal);
  try {
    for await (const _ of pieces) if (signal.aborted) break;
  } catch {
    // a failed answer is still saved: that's what's being tested
  }
  const [row] = await query<{ text: string; steps: unknown; cards: { title: string }[] | null; tool_calls: unknown; stopped: boolean; error: string | null }>(
    "SELECT text, steps, cards, tool_calls, stopped, error FROM assistant_messages WHERE chat_id = $1",
    [chatId],
  );
  return row;
}

test("an answer is saved as the chat showed it, with the tool calls the model made", async () => {
  const saved = await answerFrom(graphStream());
  expect(saved.text).toBe("One customer owes ₹500.");
  expect(saved.steps).toEqual([{ label: "Checked balances due", icon: "rupee" }]);
  expect(saved.cards?.[0].title).toBe("Customers who still owe (1)");
  expect(saved.tool_calls).toEqual([{ name: "balances_due", args: { min: 1 } }]);
  expect(saved).toMatchObject({ stopped: false, error: null });
});

test("an answer that ends badly is saved too: stopped, cut off, failed before a word, or empty", async () => {
  const stop = new AbortController();
  stop.abort(); // Stop pressed: what arrived is kept, marked stopped, not failed
  expect(await answerFrom(graphStream(), stop.signal)).toMatchObject({ stopped: true, error: null });
  expect(await answerFrom(graphStream({ failAfterWords: true }))).toMatchObject({
    text: "One customer owes ₹500.",
    error: "The reply was cut off halfway. Please try again.",
  });
  expect(await answerFrom(graphStream({ failFirst: true }))).toMatchObject({
    text: "",
    error: "Too many questions in the last minute. Wait a minute, then try again.",
  });
  expect(await answerFrom(graphStream({ words: "" }))).toMatchObject({ error: "Gemini sent back an empty answer. Try asking another way." });
});

test("the model's history comes from the saved chat: failed replies left out, drafts with their notes, typed notes removed", async () => {
  const chatId = randomUUID();
  await ensureChat(chatId, me);
  const draftId = await saveDraft(me, "booking", { customer_name: "History Test" });
  // As if confirmed and saved as VB-0099 (claimDraft's update, then finishDraft)
  await query("UPDATE assistant_drafts SET status = 'confirmed', settled_at = now() WHERE id = $1", [draftId]);
  await finishDraft(draftId, "VB-0099");
  const draftCard = { kind: "draft", id: draftId, title: "New booking", icon: "bookings", fields: [], status: "pending", formHref: "/" } as const;
  for (const m of [
    { role: "user", text: "First question" },
    { role: "assistant", text: "Ready below. [After this answer: the admin pressed Confirm and the booking draft was saved as VB-1234.]", cards: [draftCard] },
    { role: "user", text: "Second question" },
    { role: "assistant", text: "", error: "Too many questions in the last minute." },
    { role: "user", text: "Third question" },
    { role: "assistant", text: "Third answer" },
  ] as NewMessage[]) {
    await addMessage(chatId, me, m);
  }
  const history = await historyFor(chatId, me);
  expect(history.map((m) => `${m.getType()}: ${m.text}`)).toEqual([
    "human: First question",
    "ai: Ready below. \n\n[After this answer: the admin pressed Confirm and the booking draft was saved as VB-0099.]",
    // "Second question" is left out: its reply failed
    "human: Third question",
    "ai: Third answer",
  ]);
  expect(await historyFor(chatId, other)).toEqual([]); // not theirs
});

test("a deleted admin's chats and messages go with them", async () => {
  const [u] = await query<{ id: number }>(
    "INSERT INTO users (mobile, name, role, password_hash, created_by) VALUES ('9000000303', 'Leaving Admin', 'admin', 'x', 'tests') RETURNING id::int AS id",
  );
  const id = randomUUID();
  await ensureChat(id, u.id);
  await addMessage(id, u.id, { role: "user", text: "Bye" });
  await query("DELETE FROM users WHERE id = $1", [u.id]);
  const [left] = await query<{ n: number }>("SELECT count(*)::int AS n FROM assistant_messages WHERE chat_id = $1", [id]);
  expect(left.n).toBe(0);
});
