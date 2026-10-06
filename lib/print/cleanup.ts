import { logActivity, SYSTEM_ACTOR } from "../activity";
import { PRINT_SHOP } from "./files";
import { claimCleanup, expiredUploads, markDeleted } from "./orders";
import { deleteStoredFiles } from "./storage";

/** Deletes customers' files (and abandoned uploads) older than PRINT_SHOP.keepDays from storage */
export async function deleteExpiredFiles(): Promise<{ removed: number; orderFiles: number }> {
  let removed = 0;
  let orderFiles = 0;
  for (;;) {
    const keys = await expiredUploads(PRINT_SHOP.keepDays);
    if (keys.length === 0) break;
    await deleteStoredFiles(keys);
    orderFiles += await markDeleted(keys);
    removed += keys.length;
    if (keys.length < 500) break;
  }
  if (orderFiles > 0) {
    await logActivity(
      SYSTEM_ACTOR,
      "print.files_deleted",
      null,
      `${orderFiles} customer file${orderFiles === 1 ? "" : "s"} older than ${PRINT_SHOP.keepDays} days removed from storage`,
    );
  }
  return { removed, orderFiles };
}

/**
 * Runs the clean-up at most once an hour. Called when the dashboard's orders page is opened,
 * as a backup for the daily scheduled job (vercel.json).
 */
export async function cleanupIfDue(): Promise<void> {
  try {
    if (await claimCleanup(60)) await deleteExpiredFiles();
  } catch (err) {
    console.error("Print file clean-up failed:", err);
  }
}
