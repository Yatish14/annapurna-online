import { currentUser } from "@/lib/auth";
import { getFileLocation } from "@/lib/print/orders";
import { readStoredFile } from "@/lib/print/storage";

/**
 * A customer's file, for signed-in dashboard users only (files are private in storage).
 * ?download=1 saves it instead of showing it in the browser.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return new Response("Please sign in to the dashboard.", { status: 401 });

  const file = await getFileLocation(Number((await params).id));
  if (!file) return new Response("File not found.", { status: 404 });
  if (file.deleted) return new Response("This file was deleted automatically 3 days after it was uploaded.", { status: 410 });

  const stream = await readStoredFile(file.storage_key);
  if (!stream) return new Response("This file is no longer in storage.", { status: 410 });

  const download = new URL(request.url).searchParams.has("download");
  const name = `${file.order_no} ${file.file_name}`;
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const headers = new Headers({
    "Content-Type": file.content_type,
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex",
  });
  // Uploaded content can't run scripts on this site (the browser's PDF viewer needs this off)
  if (file.content_type !== "application/pdf") headers.set("Content-Security-Policy", "sandbox");
  return new Response(stream, { headers });
}
