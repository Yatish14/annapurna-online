import { query } from "@/lib/db";
import { todayIST } from "@/lib/dates";
import { DAILY_LIMIT } from "./limits";

/** How many questions each admin asks per day (the assistant_usage table, db/schema.sql). Server only. */

/** Questions this admin has asked today */
export async function questionsToday(userId: number): Promise<number> {
  const [row] = await query<{ questions: number }>(
    "SELECT questions FROM assistant_usage WHERE user_id = $1 AND day = $2",
    [userId, todayIST()],
  );
  return row?.questions ?? 0;
}

/**
 * Counts one question, unless today's limit is already reached. Returns how many are left after this one,
 * or null if none were left. Checking and counting are one SQL statement, so two questions sent at the same
 * moment (two tabs) can't both slip past the limit.
 */
export async function countQuestion(userId: number): Promise<number | null> {
  const [row] = await query<{ questions: number }>(
    // First question today → a new row with 1. Otherwise add 1, but only while still under the limit
    // (when it isn't, the WHERE stops the update and no row comes back).
    `INSERT INTO assistant_usage (user_id, day, questions) VALUES ($1, $2, 1)
     ON CONFLICT (user_id, day) DO UPDATE SET questions = assistant_usage.questions + 1
       WHERE assistant_usage.questions < $3
     RETURNING questions`,
    [userId, todayIST(), DAILY_LIMIT],
  );
  return row ? DAILY_LIMIT - row.questions : null;
}
