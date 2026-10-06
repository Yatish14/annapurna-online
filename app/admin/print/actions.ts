"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { can, currentUser, requireUser } from "@/lib/auth";
import { optionsText, PRINT_SHOP } from "@/lib/print/files";
import { markDeleted, orderFileKeys, recordPrint, setAccepting, setOrderStatus } from "@/lib/print/orders";
import { deleteStoredFiles } from "@/lib/print/storage";
import { safeBack, withFlash } from "../filters";

/**
 * Called by the Print button once the print dialog (or the download) has opened.
 * Returns an error message instead of redirecting, because it's called from the page's script.
 */
export async function markPrinted(fileId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await currentUser();
  if (!user || !can(user, "managePrints")) return { ok: false, error: "Your role doesn't allow printing." };

  const result = await recordPrint(Number(fileId), user.name);
  if (!result) return { ok: false, error: "That file is no longer available." };

  await logActivity(
    user,
    "order.file_printed",
    result.order_no,
    [result.file.file_name, optionsText(result.file), result.orderPrinted ? "all files printed" : null].filter(Boolean).join(" · "),
  );
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** Mark collected, or undo it */
export async function updateOrder(formData: FormData) {
  const user = await requireUser("managePrints");
  const back = safeBack(formData.get("back"));
  const action = String(formData.get("action"));
  if (action !== "collected" && action !== "reopen") redirect(withFlash(back, "invalid"));

  const order = await setOrderStatus(Number(formData.get("id")), action, user.name);
  if (!order) redirect(withFlash(back, "not-found"));

  await logActivity(user, action === "collected" ? "order.collected" : "order.reopened", order.order_no);
  revalidatePath("/admin", "layout");
  redirect(withFlash(back, action === "collected" ? "order-collected" : "order-reopened", order.order_no));
}

/** Pause or resume the public print page */
export async function setUploads(formData: FormData) {
  const user = await requireUser("managePrints");
  const back = safeBack(formData.get("back"));
  const on = formData.get("on") === "1";

  await setAccepting(on, user.name);
  await logActivity(user, on ? "print.uploads_resumed" : "print.uploads_paused", null);
  revalidatePath("/admin", "layout");
  redirect(withFlash(back, on ? "uploads-resumed" : "uploads-paused"));
}

/** Deletes an order's files from storage straight away, e.g. when the customer asks (the order itself is kept) */
export async function deleteOrderFiles(formData: FormData) {
  const user = await requireUser("managePrints");
  const back = safeBack(formData.get("back"));

  const order = await orderFileKeys(Number(formData.get("id")));
  if (!order || order.keys.length === 0) redirect(withFlash(back, "not-found"));

  await deleteStoredFiles(order.keys);
  const count = await markDeleted(order.keys, user.name);
  await logActivity(user, "order.files_deleted", order.order_no, `${count} file${count === 1 ? "" : "s"} deleted before the ${PRINT_SHOP.keepDays}-day limit`);
  revalidatePath("/admin", "layout");
  redirect(withFlash(back, "files-deleted", order.order_no));
}
