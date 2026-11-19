import { query } from "@/lib/db";
import { addDays, fmtDayMonth, fmtLong, todayIST } from "@/lib/dates";
import type { Card, Chat, Message, ToolStep } from "./types";

/**
 * Annapurna Assist's saved chats (the assistant_chats and assistant_messages tables, db/schema.sql, Step 5).
 * Server only. Every function takes the signed-in admin's id and only ever touches that admin's chats: another
 * admin's chat is treated as if it didn't exist.
 */

/** A chat id is a UUID (made by the browser). Anything else is turned away before it reaches the database. */
const CHAT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isChatId = (id: unknown): id is string => typeof id === "string" && CHAT_ID.test(id);

/** A saved chat as the chat list shows it (its messages load when it's opened) */
export type ChatSummary = { id: string; title: string; titled: boolean; when: string };

/**
 * Makes sure this chat exists and is this admin's: a new id becomes a new chat for them. False if the id belongs
 * to another admin (or isn't an id): the caller refuses the question.
 */
export async function ensureChat(id: string, userId: number): Promise<ChatSummary | null> {
  if (!isChatId(id)) return null;
  await query("INSERT INTO assistant_chats (id, user_id) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING", [id, userId]);
  const [chat] = await query<Row>(`SELECT ${SUMMARY} FROM assistant_chats WHERE id = $1 AND user_id = $2`, [id, userId]);
  return chat ? summary(chat) : null;
}

/** One of this admin's chats (title and when), or null. Unlike ensureChat, never makes one. */
export async function chatSummary(id: string, userId: number): Promise<ChatSummary | null> {
  if (!isChatId(id)) return null;
  const [chat] = await query<Row>(`SELECT ${SUMMARY} FROM assistant_chats WHERE id = $1 AND user_id = $2`, [id, userId]);
  return chat ? summary(chat) : null;
}

/**
 * Who is naming a chat:
 * - "question": its first question, cut short (5.4)
 * - "writer": Flash-Lite, from that question (5.5)
 * - "admin": the admin renaming it (5.6)
 * The first two only name a chat nobody has named yet, so neither can replace the admin's name, even when
 * Flash-Lite's title arrives after a quick rename. The admin's name always applies.
 */
export type TitleBy = "question" | "writer" | "admin";

/** Sets one of this admin's chats' title. False if it isn't theirs, there's no title, or it's already named (above). */
export async function setTitle(id: string, userId: number, title: string, by: TitleBy): Promise<boolean> {
  const clean = title.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!isChatId(id) || !clean) return false;
  const rows = await query(
    `UPDATE assistant_chats SET title = $3, titled = $4
     WHERE id = $1 AND user_id = $2 AND ($5 OR titled = false) RETURNING id`,
    [id, userId, clean, by !== "question", by === "admin"],
  );
  return rows.length === 1;
}

/** One question or answer to keep, as the chat shows it */
export type NewMessage = {
  role: "user" | "assistant";
  text: string;
  steps?: ToolStep[];
  cards?: Card[];
  /** The tools the model called and the inputs it chose */
  toolCalls?: { name: string; args: Record<string, unknown> }[];
  voice?: boolean;
  stopped?: boolean;
  error?: string;
};

/** Adds a message to one of this admin's chats (moving the chat to the top of their list). False if it isn't theirs. */
export async function addMessage(chatId: string, userId: number, m: NewMessage): Promise<boolean> {
  if (!isChatId(chatId)) return false;
  const json = (v: unknown[] | undefined) => (v?.length ? JSON.stringify(v) : null);
  const rows = await query(
    `WITH chat AS (UPDATE assistant_chats SET updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING id)
     INSERT INTO assistant_messages (chat_id, role, text, steps, cards, tool_calls, voice, stopped, error)
     SELECT id, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10 FROM chat
     RETURNING id`,
    [chatId, userId, m.role, m.text, json(m.steps), json(m.cards), json(m.toolCalls), m.voice ?? false, m.stopped ?? false, m.error ?? null],
  );
  return rows.length === 1;
}

type MessageRow = {
  id: number;
  role: "user" | "assistant";
  text: string;
  steps: ToolStep[] | null;
  cards: Card[] | null;
  voice: boolean;
  stopped: boolean;
  error: string | null;
  time: string;
};

/** A chat's messages, oldest first, as the chat shows them. Null if it isn't this admin's chat. */
export async function chatMessages(chatId: string, userId: number): Promise<Message[] | null> {
  if (!isChatId(chatId)) return null;
  const [owned] = await query("SELECT 1 FROM assistant_chats WHERE id = $1 AND user_id = $2", [chatId, userId]);
  if (!owned) return null;
  const rows = await query<MessageRow>(
    `SELECT id::int AS id, role, text, steps, cards, voice, stopped, error,
            lower(to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'FMHH12:MI am')) AS time
     FROM assistant_messages WHERE chat_id = $1 ORDER BY id`,
    [chatId],
  );
  return rows.map((r) => ({
    id: `m-${r.id}`,
    role: r.role,
    text: r.text,
    time: r.time,
    ...(r.steps ? { steps: r.steps } : {}),
    ...(r.cards ? { cards: r.cards } : {}),
    ...(r.voice ? { voice: true } : {}),
    ...(r.stopped ? { stopped: true } : {}),
    ...(r.error ? { error: r.error } : {}),
  }));
}

/** A saved message as the model's history needs it (lib/assistant/history.ts) */
export type HistoryRow = {
  role: "user" | "assistant";
  text: string;
  error: string | null;
  cards: Card[] | null;
  /** The tools an answer called, with what the model passed (for an unfinished booking's details, history.ts) */
  toolCalls?: { name: string; args: Record<string, unknown> }[] | null;
};

/** A chat's saved messages for the model's history, oldest first. Empty if it isn't this admin's chat. */
export async function chatHistory(chatId: string, userId: number): Promise<HistoryRow[]> {
  if (!isChatId(chatId)) return [];
  return query<HistoryRow>(
    `SELECT m.role, m.text, m.error, m.cards, m.tool_calls AS "toolCalls" FROM assistant_messages m
     JOIN assistant_chats c ON c.id = m.chat_id AND c.user_id = $2
     WHERE m.chat_id = $1 ORDER BY m.id`,
    [chatId, userId],
  );
}

/** This admin's chats for the list, newest first */
export async function listChats(userId: number, limit = 100): Promise<ChatSummary[]> {
  const rows = await query<Row>(
    `SELECT ${SUMMARY} FROM assistant_chats c
     WHERE user_id = $1 AND EXISTS (SELECT 1 FROM assistant_messages m WHERE m.chat_id = c.id)
     ORDER BY updated_at DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map(summary);
}

/** A summary as a Chat the browser can show before its messages load */
export const unloaded = (c: ChatSummary): Chat => ({ id: c.id, title: c.title, when: c.when, messages: [], unloaded: true });

// ---------- shared ----------

type Row = { id: string; title: string; titled: boolean; day: string };
const SUMMARY = `id, title, titled, to_char(updated_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day`;

/** "Today", "Yesterday", "12 Oct" (this year) or "12 Oct 2025" */
function whenText(day: string): string {
  const today = todayIST();
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  return day.slice(0, 4) === today.slice(0, 4) ? fmtDayMonth(day) : fmtLong(day);
}

const summary = (r: Row): ChatSummary => ({ id: r.id, title: r.title, titled: r.titled, when: whenText(r.day) });

/** Deletes one of this admin's chats and all its messages (5.6). False if it isn't theirs. */
export async function deleteChat(id: string, userId: number): Promise<boolean> {
  if (!isChatId(id)) return false;
  const rows = await query("DELETE FROM assistant_chats WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId]);
  return rows.length === 1;
}

/** A chat found by a search (5.8): with a bit of the message that matched, if the match wasn't only in its title */
export type FoundChat = ChatSummary & { snippet: string | null };

/** Results shown for one search */
const MAX_FOUND = 20;

/** A piece of `text` around the first place `q` is in it: "…the Innova for Ravi Kumar, Vijayawada…" */
export function snippetAround(text: string, q: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const at = flat.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return flat.slice(0, 90) + (flat.length > 90 ? "…" : "");
  const start = Math.max(0, at - 30);
  const end = Math.min(flat.length, at + q.length + 60);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

/**
 * This admin's chats whose title or messages contain `q` (any case), newest first (5.8). On the server, so it finds
 * chats whose messages haven't been loaded in the browser. ILIKE reads every message of the admin's chats: fine for
 * one business's chats; with many thousands, a trigram index (pg_trgm) would make it fast.
 */
export async function searchChats(userId: number, q: string): Promise<FoundChat[]> {
  const text = q.replace(/\s+/g, " ").trim().slice(0, 100);
  if (text.length < 2) return [];
  // % and _ mean "anything" in LIKE: typed by the admin they're just characters. So each gets "!" in front, and
  // ESCAPE '!' tells LIKE that "!" makes the next character plain ("!" itself too, as "!!")
  const pattern = `%${text.replace(/[!%_]/g, "!$&")}%`;
  const rows = await query<Row & { hit: string | null }>(
    `SELECT ${SUMMARY},
            (SELECT m.text FROM assistant_messages m
             WHERE m.chat_id = c.id AND m.text ILIKE $2 ESCAPE '!' ORDER BY m.id DESC LIMIT 1) AS hit
     FROM assistant_chats c
     WHERE c.user_id = $1
       AND (c.title ILIKE $2 ESCAPE '!'
            OR EXISTS (SELECT 1 FROM assistant_messages m WHERE m.chat_id = c.id AND m.text ILIKE $2 ESCAPE '!'))
     ORDER BY c.updated_at DESC LIMIT $3`,
    [userId, pattern, MAX_FOUND],
  );
  return rows.map((r) => ({ ...summary(r), snippet: r.hit ? snippetAround(r.hit, text) : null }));
}
