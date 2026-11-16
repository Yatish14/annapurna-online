"use server";

import { revalidatePath } from "next/cache";
import { cancelDraftAs, confirmDraftAs, type DraftActionResult } from "@/lib/assistant/confirm";
import { can, currentUser } from "@/lib/auth";

/**
 * Annapurna Assist's draft card buttons, Confirm (4.6) and Cancel (4.11), as server actions. What they do is in
 * lib/assistant/confirm.ts; here is only who may do it. Like every server action, these can be called by a direct
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
