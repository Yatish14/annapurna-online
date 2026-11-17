"use server";

import { revalidatePath } from "next/cache";
import { cancelDraftAs, confirmDraftAs, type DraftActionResult } from "@/lib/assistant/confirm";
import { deleteChat, type FoundChat, searchChats, setTitle } from "@/lib/assistant/chatStore";
import { openChat } from "@/lib/assistant/openChat";
import type { Chat } from "@/lib/assistant/types";
import { can, currentUser } from "@/lib/auth";

/**
 * Annapurna Assist's server actions: the draft card buttons, Confirm (4.6) and Cancel (4.11), and the chat list's
 * actions (Step 5). What they do is in lib/assistant; here is only who may do it. Like every server action, these can be called by a direct
 * POST, not just from our buttons, so they check who is asking themselves.
 */

export type { CardState, DraftActionResult } from "@/lib/assistant/confirm";

export async function confirmDraft(id: unknown): Promise<DraftActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  if (!can(user, "useAssistant") || !can(user, "manageExpenses")) return { ok: false, error: "Your role can't save bookings, payments or fuel." };
  const result = await confirmDraftAs(user, id);
  if (result.ok) revalidatePath("/admin/expenses", "layout"); // the Bookings pages show it straight away
  return result;
}

export async function cancelDraft(id: unknown): Promise<DraftActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  if (!can(user, "useAssistant")) return { ok: false, error: "Your role can't cancel drafts." };
  return cancelDraftAs(user, id);
}

/**
 * A saved chat's messages, for opening it from the chat list (5.4): only the signed-in admin's own chats. Null if
 * it isn't theirs, or was deleted meanwhile.
 */
export async function loadChat(id: unknown): Promise<Chat | null> {
  const user = await currentUser();
  if (!user || typeof id !== "string") return null;
  return openChat(id, user.id);
}

/** Rename (5.6): a title the admin wrote, so Flash-Lite's never replaces it */
export async function renameChat(id: unknown, title: unknown): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  if (!can(user, "useAssistant")) return { ok: false, error: "Your role can't rename chats." };
  const clean = typeof title === "string" ? title.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  if (!clean) return { ok: false, error: "Type a name for the chat." };
  if (typeof id !== "string" || !(await setTitle(id, user.id, clean, "admin"))) return { ok: false, error: "This chat wasn't found." };
  return { ok: true, title: clean };
}

/** Delete (5.6): the chat and all its messages, only the admin's own */
export async function removeChat(id: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  if (!can(user, "useAssistant")) return { ok: false, error: "Your role can't delete chats." };
  if (typeof id !== "string" || !(await deleteChat(id, user.id))) return { ok: false, error: "This chat wasn't found." };
  return { ok: true };
}

/** Search (5.8): the signed-in admin's own chats whose title or messages contain the words */
export async function findChats(q: unknown): Promise<FoundChat[]> {
  const user = await currentUser();
  if (!user || typeof q !== "string") return [];
  return searchChats(user.id, q);
}
