import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { PRINT_LIMITS } from "@/lib/print/files";
import { getSlot } from "@/lib/print/orders";
import { isStorageKey, storageMode } from "@/lib/print/storage";

/**
 * Vercel Blob uploads: the customer's phone uploads straight to storage (no 4.5 MB limit) using a
 * short-lived presigned URL, valid only for one upload slot handed out by reserveUploads().
 * Works with the project's OIDC connection on Vercel, or a read-write token locally.
 */
export async function POST(request: Request) {
  if (storageMode() !== "blob") return Response.json({ error: "Not available" }, { status: 404 });

  let body: HandleUploadPresignedBody;
  try {
    body = (await request.json()) as HandleUploadPresignedBody;
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  // Only upload URLs are handed out here; we don't use upload-completed callbacks
  if (body?.type !== "blob.generate-presigned-url") return Response.json({ error: "Bad request" }, { status: 400 });

  try {
    const result = await handleUploadPresigned({
      body,
      request,
      // Required by the SDK, but only used to verify upload-completed callbacks, which are refused above
      webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY || "unused",
      getSignedToken: async (pathname) => {
        const slot = isStorageKey(pathname) ? await getSlot(pathname) : null;
        if (!slot || slot.used || slot.expired) throw new Error("This upload has expired. Please choose your files again.");
        const limits = {
          allowedContentTypes: [slot.content_type],
          maximumSizeInBytes: PRINT_LIMITS.maxFileMB * 1024 * 1024,
          validUntil: Date.now() + 30 * 60_000,
        };
        const token = await issueSignedToken({ pathname, operations: ["put"], ...limits });
        return { token, urlOptions: { ...limits, addRandomSuffix: false, allowOverwrite: false } };
      },
    });
    return Response.json(result);
  } catch (err) {
    console.error("Print upload URL failed:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 400 });
  }
}
