import { del, get, head } from "@vercel/blob";
import { createReadStream } from "node:fs";
import { mkdir, open, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { extensionOf } from "./files";

// Where customers' files are kept:
// - Vercel Blob in production: a Blob store connected to the Vercel project (Vercel sets
//   BLOB_STORE_ID and signs in with OIDC), or a BLOB_READ_WRITE_TOKEN. Files are private: only
//   the dashboard can read them, through /api/print/file/[id].
// - A local folder (.data/uploads) otherwise, for development on your computer.

export type StorageMode = "blob" | "local";

export function storageMode(): StorageMode {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  // OIDC sign-in only works on Vercel (or after `vercel env pull`), so a store id alone on your computer means local
  if (process.env.BLOB_STORE_ID && (process.env.VERCEL || process.env.VERCEL_OIDC_TOKEN)) return "blob";
  return "local";
}

/** Vercel's servers can't keep files on disk, so production needs Blob storage */
export function storageReady(): boolean {
  return storageMode() === "blob" || !process.env.VERCEL;
}

/** 'private' unless the Blob store was created as a public store */
export function blobAccess(): "private" | "public" {
  return process.env.BLOB_ACCESS === "public" ? "public" : "private";
}

const LOCAL_DIR = path.join(process.cwd(), ".data", "uploads");

/** Storage keys look like print/<32 random hex>.<ext>; anything else is refused */
export function isStorageKey(key: string): boolean {
  return /^print\/[0-9a-f]{32}\.[a-z0-9]{1,5}$/.test(key);
}

function localPath(key: string): string {
  if (!isStorageKey(key)) throw new Error("Invalid storage key");
  return path.join(LOCAL_DIR, ...key.split("/"));
}

export async function writeLocalFile(key: string, data: Buffer): Promise<void> {
  const file = localPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data, { flag: "wx" }); // never overwrite
}

/** Size of a stored file, or null if nothing was uploaded under that key */
export async function storedSize(key: string): Promise<number | null> {
  try {
    if (storageMode() === "blob") return (await head(key)).size;
    return (await stat(localPath(key))).size;
  } catch {
    return null;
  }
}

/** The file's contents as a web stream, or null if it no longer exists */
export async function readStoredFile(key: string): Promise<ReadableStream<Uint8Array> | null> {
  if (storageMode() === "blob") {
    const result = await get(key, { access: blobAccess(), useCache: false });
    return result?.statusCode === 200 ? result.stream : null;
  }
  try {
    const file = localPath(key);
    await stat(file);
    return Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>;
  } catch {
    return null;
  }
}

/** The first bytes of a stored file, to check it really is the type its name says */
async function readStart(key: string, length = 16): Promise<Buffer | null> {
  if (storageMode() === "local") {
    try {
      const handle = await open(localPath(key));
      try {
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, 0);
        return buffer.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
    } catch {
      return null;
    }
  }
  const stream = await readStoredFile(key);
  if (!stream) return null;
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < length) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(chunks).subarray(0, length);
}

const startsWith = (b: Buffer, bytes: number[]) => bytes.every((v, i) => b[i] === v);
const ZIP = [0x50, 0x4b, 0x03, 0x04]; // .docx, .xlsx, .pptx and OpenDocument files are ZIP-based
const OLE = [0xd0, 0xcf, 0x11, 0xe0]; // older .doc, .xls, .ppt

/**
 * Does the file's content match its extension? Stops, for example, a program or a ZIP file
 * renamed to .pdf. (Office files are ZIP-based, so a ZIP renamed to .docx still passes;
 * it just won't open in Word.)
 */
export async function contentMatchesName(key: string, name: string): Promise<boolean> {
  const b = await readStart(key);
  if (!b || b.length === 0) return false;
  switch (extensionOf(name)) {
    case "pdf":
      return b.subarray(0, 1024).includes("%PDF-");
    case "png":
      return startsWith(b, [0x89, 0x50, 0x4e, 0x47]);
    case "jpg":
    case "jpeg":
      return startsWith(b, [0xff, 0xd8, 0xff]);
    case "gif":
      return b.subarray(0, 4).toString("latin1") === "GIF8";
    case "webp":
      return b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP";
    case "bmp":
      return b.subarray(0, 2).toString("latin1") === "BM";
    case "tif":
    case "tiff":
      return startsWith(b, [0x49, 0x49, 0x2a, 0x00]) || startsWith(b, [0x4d, 0x4d, 0x00, 0x2a]);
    case "heic":
    case "heif":
      return b.subarray(4, 8).toString("latin1") === "ftyp";
    case "docx":
    case "xlsx":
    case "pptx":
    case "odt":
    case "ods":
    case "odp":
      return startsWith(b, ZIP);
    case "doc":
    case "xls":
    case "ppt":
      return startsWith(b, OLE);
    case "rtf":
      return b.subarray(0, 5).toString("latin1") === "{\\rtf";
    case "txt":
    case "csv":
      // Plain text has no zero bytes and doesn't start like a program or an archive
      return !b.includes(0) && !b.subarray(0, 2).equals(Buffer.from("MZ")) && !startsWith(b, ZIP);
    default:
      return false;
  }
}

/** Removes files from storage. Missing files are ignored. */
export async function deleteStoredFiles(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  if (storageMode() === "blob") {
    for (let i = 0; i < keys.length; i += 100) await del(keys.slice(i, i + 100));
    return;
  }
  for (const key of keys) {
    if (!isStorageKey(key)) continue;
    await rm(localPath(key), { force: true });
  }
}
