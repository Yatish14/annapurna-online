import { PRINT_LIMITS } from "@/lib/print/files";
import { getSlot } from "@/lib/print/orders";
import { isStorageKey, storageMode, writeLocalFile } from "@/lib/print/storage";

/** Development only (no Vercel Blob token): saves an upload into .data/uploads */
export async function PUT(request: Request) {
  if (storageMode() !== "local" || process.env.VERCEL) return Response.json({ error: "Not available" }, { status: 404 });

  const key = new URL(request.url).searchParams.get("key") ?? "";
  const slot = isStorageKey(key) ? await getSlot(key) : null;
  if (!slot || slot.used || slot.expired) {
    return Response.json({ error: "This upload has expired. Please choose your files again." }, { status: 400 });
  }

  const max = PRINT_LIMITS.maxFileMB * 1024 * 1024;
  if (Number(request.headers.get("content-length") ?? 0) > max) {
    return Response.json({ error: `Files can be up to ${PRINT_LIMITS.maxFileMB} MB.` }, { status: 413 });
  }
  const data = Buffer.from(await request.arrayBuffer());
  if (data.length === 0 || data.length > max) return Response.json({ error: "Empty or too large" }, { status: 400 });

  try {
    await writeLocalFile(key, data);
  } catch {
    return Response.json({ error: "Already uploaded" }, { status: 409 });
  }
  return Response.json({ ok: true });
}
