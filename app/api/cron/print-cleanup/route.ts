import { deleteExpiredFiles } from "@/lib/print/cleanup";

/**
 * Daily job (see vercel.json): deletes customers' files older than 3 days.
 * Vercel sends "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set in the project settings.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await deleteExpiredFiles();
  return Response.json({ ok: true, ...result });
}
