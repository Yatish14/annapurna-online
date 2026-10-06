"use server";

import { headers } from "next/headers";
import { logActivity } from "@/lib/activity";
import { isValidMobile, normalizeMobile } from "@/lib/auth";
import {
  checkFile,
  extensionOf,
  normalizePageRange,
  PRINT_LIMITS,
  type ColorMode,
  type PrintOptions,
  type Sides,
} from "@/lib/print/files";
import { createOrder, getSlot, hashIp, isAccepting, reserveSlots, tooManyOrders, type NewFile } from "@/lib/print/orders";
import { blobAccess, contentMatchesName, isStorageKey, storageMode, storageReady, storedSize } from "@/lib/print/storage";

type Fail = { ok: false; error: string };

const CLOSED = "We're not taking uploads right now. Please ask at the counter.";
const NOT_SET_UP = "Uploads aren't available yet. Please hand your file over at the counter.";
const BUSY = "Too many uploads from your network right now. Please wait a few minutes, or ask at the counter.";

async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return hashIp(ip);
}

/** File names as shown in the dashboard: no folders or control characters, sensible length */
function cleanName(name: unknown): string {
  const base = String(name ?? "").split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (clean.length <= 120) return clean;
  const ext = extensionOf(clean);
  return `${clean.slice(0, 110 - ext.length)}….${ext}`;
}

export type ReserveResult =
  | { ok: true; mode: "blob" | "local"; access: "private" | "public"; keys: string[] }
  | Fail;

/** Step 1: checks the chosen files and hands out a storage key for each */
export async function reserveUploads(files: { name: string; size: number }[]): Promise<ReserveResult> {
  if (!Array.isArray(files) || files.length === 0) return { ok: false, error: "Choose at least one file." };
  if (files.length > PRINT_LIMITS.maxFiles) return { ok: false, error: `You can send up to ${PRINT_LIMITS.maxFiles} files at a time.` };
  if (!storageReady()) return { ok: false, error: NOT_SET_UP };
  if (!(await isAccepting())) return { ok: false, error: CLOSED };

  const slots = [];
  for (const f of files) {
    const check = checkFile(cleanName(f?.name), Number(f?.size));
    if (!check.ok) return { ok: false, error: check.error };
    slots.push({ ext: check.ext, contentType: check.type.mime });
  }

  const keys = await reserveSlots(slots, await clientIpHash());
  if (!keys) return { ok: false, error: BUSY };
  return { ok: true, mode: storageMode(), access: blobAccess(), keys };
}

export type SubmitFile = { key: string; name: string; options: PrintOptions };

/** Step 3 (after the files are uploaded): saves the order and returns its confirmation link id */
export async function submitOrder(input: {
  name: string;
  phone: string;
  files: SubmitFile[];
}): Promise<{ ok: true; publicId: string } | Fail> {
  if (!(await isAccepting())) return { ok: false, error: CLOSED };

  const customerName = String(input?.name ?? "").replace(/\s+/g, " ").trim().slice(0, 60) || null;
  const phoneInput = String(input?.phone ?? "").trim();
  const phone = phoneInput ? normalizeMobile(phoneInput) : null;
  if (phone && !isValidMobile(phone)) return { ok: false, error: "Enter a valid 10-digit mobile number, or leave it empty." };

  const list = Array.isArray(input?.files) ? input.files : [];
  if (list.length === 0 || list.length > PRINT_LIMITS.maxFiles) return { ok: false, error: "Choose between 1 and 10 files." };
  if (new Set(list.map((f) => f?.key)).size !== list.length) return { ok: false, error: "Something went wrong. Please try again." };

  const files: NewFile[] = [];
  for (const f of list) {
    const name = cleanName(f?.name);
    const key = String(f?.key ?? "");
    const expired = { ok: false as const, error: "Your upload took too long and expired. Please choose your files again." };
    const slot = isStorageKey(key) ? await getSlot(key) : null;
    if (!slot || slot.used) return { ok: false, error: "Something went wrong. Please try again." };
    if (slot.expired) return expired;

    const size = await storedSize(key);
    if (size === null) return { ok: false, error: `${name || "A file"} didn't finish uploading. Please try again.` };
    const check = checkFile(name, size);
    if (!check.ok) return { ok: false, error: check.error };
    if (check.type.mime !== slot.content_type || !key.endsWith(`.${check.ext}`)) {
      return { ok: false, error: "Something went wrong. Please try again." };
    }
    if (!(await contentMatchesName(key, name))) {
      return { ok: false, error: `${name} doesn't look like a real ${check.type.label} file, so it can't be printed. Please check the file and try again.` };
    }

    const o = f.options ?? ({} as PrintOptions);
    const color: ColorMode = o.color === "color" ? "color" : "bw";
    const sides: Sides = o.sides === "double" ? "double" : "single";
    const copies = Number(o.copies);
    if (!Number.isInteger(copies) || copies < 1 || copies > 99) return { ok: false, error: `${name}: copies must be between 1 and 99.` };
    let pageRange: string | null = null;
    if (!check.type.image) {
      const pages = normalizePageRange(String(o.pages ?? ""));
      if (pages === null) return { ok: false, error: `${name}: write pages like 1-3, 5 (or choose "All pages").` };
      pageRange = pages || null;
    }

    files.push({
      storage_key: key,
      file_name: name,
      content_type: slot.content_type,
      size_bytes: size,
      color,
      sides,
      copies,
      page_range: pageRange,
    });
  }

  const ipHash = await clientIpHash();
  if (await tooManyOrders(ipHash)) return { ok: false, error: BUSY };

  const order = await createOrder({ customerName, phone, ipHash, files });
  const names = files.map((f) => f.file_name).join(", ");
  await logActivity(
    { name: customerName ?? "Customer", mobile: phone },
    "order.created",
    order.order_no,
    `${files.length} file${files.length === 1 ? "" : "s"}: ${names.length > 160 ? `${names.slice(0, 157)}…` : names}`,
  );
  return { ok: true, publicId: order.public_id };
}
