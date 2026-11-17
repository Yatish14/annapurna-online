import "./unitDb"; // first: the no-browser tests' own throwaway database
import { randomUUID } from "node:crypto";
import { AIMessage, AIMessageChunk, ToolMessage } from "@langchain/core/messages";
import { expect, test } from "@playwright/test";
import { addMessage, chatMessages, chatSummary, deleteChat, ensureChat, listChats, type NewMessage, setTitle } from "@/lib/assistant/chatStore";
import { finishDraft, saveDraft } from "@/lib/assistant/draftStore";
import { estimateTokens, fitToBudget, HISTORY_TOKENS, historyFor } from "@/lib/assistant/history";
import { systemPrompt } from "@/lib/assistant/prompt";
import { savedAs } from "@/lib/assistant/replies";
import { cleanTitle } from "@/lib/assistant/titles";
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

test("titles: spaces tidied (letters kept), at most 80 characters; Flash-Lite names a chat once, the admin's name always wins", async () => {
  const id = randomUUID();
  await ensureChat(id, me);
  expect(await setTitle(id, me, "  Which   bookings\nare  upcoming?  ", "question")).toBe(true);
  expect((await chatSummary(id, me))?.title).toBe("Which bookings are upcoming?");
  expect(await setTitle(id, me, "x".repeat(200), "question")).toBe(true);
  expect((await chatSummary(id, me))?.title).toHaveLength(80);
  // Flash-Lite's title replaces the first question's; after that, neither can change it
  expect(await setTitle(id, me, "Upcoming bookings", "writer")).toBe(true);
  expect(await chatSummary(id, me)).toMatchObject({ title: "Upcoming bookings", titled: true });
  expect(await setTitle(id, me, "Some first question", "question")).toBe(false);
  expect(await setTitle(id, me, "Another written title", "writer")).toBe(false);
  // The admin can always rename it
  expect(await setTitle(id, me, "Renamed", "admin")).toBe(true);
  // Not theirs, or nothing: no change
  expect(await setTitle(id, other, "Mine now", "admin")).toBe(false);
  expect(await setTitle(id, me, "   ", "admin")).toBe(false);
  expect((await chatSummary(id, me))?.title).toBe("Renamed");

  // The race: the admin renames a new chat before Flash-Lite's title arrives, which then mustn't replace it
  const quick = randomUUID();
  await ensureChat(quick, me);
  await setTitle(quick, me, "First question", "question");
  await setTitle(quick, me, "My own name", "admin");
  expect(await setTitle(quick, me, "Late written title", "writer")).toBe(false);
  expect((await chatSummary(quick, me))?.title).toBe("My own name");
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
  const { messages: history, left } = await historyFor(chatId, me);
  expect(left).toBe(0); // a short chat: nothing left out
  expect(history.map((m) => `${m.getType()}: ${m.text}`)).toEqual([
    "human: First question",
    "ai: Ready below. \n\n[After this answer: the admin pressed Confirm and the booking draft was saved as VB-0099.]",
    // "Second question" is left out: its reply failed
    "human: Third question",
    "ai: Third answer",
  ]);
  expect((await historyFor(chatId, other)).messages).toEqual([]); // not theirs
});

// 5.7: a long chat is trimmed to the token budget, newest turns kept, in whole pairs
test("token budget: estimates, the newest turns that fit, always in pairs, and the model is told", async () => {
  // About 4 English letters a token; Telugu and Hindi letters count heavier (3 bytes each in UTF-8)
  expect(estimateTokens("a".repeat(400))).toBe(100);
  expect(estimateTokens("బుకింగ్".repeat(10))).toBeGreaterThan(estimateTokens("booking".repeat(10)));

  // fitToBudget: the newest that fit, oldest first; the newest is kept even if it alone is too big
  const tokens = (n: number) => n;
  expect(fitToBudget([100, 200, 300], tokens, 500)).toEqual({ kept: [200, 300], left: 1 });
  expect(fitToBudget([100, 200, 300], tokens, 600)).toEqual({ kept: [100, 200, 300], left: 0 });
  expect(fitToBudget([100, 900], tokens, 500)).toEqual({ kept: [900], left: 1 });
  expect(fitToBudget([], tokens, 500)).toEqual({ kept: [], left: 0 });

  // A real long chat: 30 turns of about 400 tokens each → only the newest that fit in HISTORY_TOKENS go
  const chatId = randomUUID();
  await ensureChat(chatId, me);
  for (let i = 1; i <= 30; i++) {
    await addMessage(chatId, me, { role: "user", text: `Question ${i}` });
    await addMessage(chatId, me, { role: "assistant", text: `Answer ${i}: ${"x".repeat(1600)}` });
  }
  const { messages, left } = await historyFor(chatId, me);
  expect(left).toBeGreaterThan(0);
  expect(messages.length % 2).toBe(0); // whole pairs
  expect(messages[0].getType()).toBe("human");
  expect(messages.at(-2)?.text).toBe("Question 30"); // the newest is there
  expect(messages[0].text).toBe(`Question ${left + 1}`); // and it starts right after what was left out
  const used = messages.reduce((n, m) => n + estimateTokens(m.text), 0);
  expect(used).toBeLessThanOrEqual(HISTORY_TOKENS);
  expect(left + messages.length / 2).toBe(30);

  // The model is told how many were left out
  expect(systemPrompt({ leftOut: left })).toContain(`its first ${left} questions and answers aren't included here`);
  expect(systemPrompt({ leftOut: 0 })).not.toContain("This is a long chat");
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

// 5.5: whatever Flash-Lite replies, the title is tidied the same way
test("a written title is tidied: no quotes, no 'Title:', no full stop, one line, not too long", async () => {
  expect(cleanTitle("Title: Upcoming bookings.")).toBe("Upcoming bookings");
  expect(cleanTitle('"Booking for Ravi Kumar"')).toBe("Booking for Ravi Kumar");
  expect(cleanTitle("**Fuel for VB-0012**\nHere is why…")).toBe("Fuel for VB-0012");
  expect(cleanTitle("  ఈ వారం బుకింగ్‌లు  ")).toBe("ఈ వారం బుకింగ్‌లు");
  expect(cleanTitle("इस हफ़्ते की बुकिंग।")).toBe("इस हफ़्ते की बुकिंग");
  expect(cleanTitle("x".repeat(100))).toHaveLength(60);
  expect(cleanTitle("   \n  ")).toBeNull();
});

// 5.6: delete removes the chat and its messages, only the owner's
test("deleting a chat removes it and its messages, and only its owner can", async () => {
  const id = randomUUID();
  await ensureChat(id, me);
  await addMessage(id, me, { role: "user", text: "To be deleted" });
  expect(await deleteChat(id, other)).toBe(false); // not theirs
  expect(await chatMessages(id, me)).toHaveLength(1);
  expect(await deleteChat(id, me)).toBe(true);
  expect(await chatMessages(id, me)).toBeNull();
  const [left] = await query<{ n: number }>("SELECT count(*)::int AS n FROM assistant_messages WHERE chat_id = $1", [id]);
  expect(left.n).toBe(0);
  expect(await deleteChat(id, me)).toBe(false); // already gone
  expect(await deleteChat("1 OR 1=1", me)).toBe(false);
});
