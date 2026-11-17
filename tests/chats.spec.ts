import "./unitDb"; // first: the no-browser tests' own throwaway database
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { addMessage, chatMessages, ensureChat, listChats } from "@/lib/assistant/chatStore";
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
