"use client";

import { useState, useTransition } from "react";
import { markPrinted } from "@/app/admin/print/actions";
import type { PrintMode } from "@/lib/print/files";
import Icon from "./Icon";

type Props = {
  fileId: number;
  fileName: string;
  /** Shown in the dialog's title (and so in the printer queue) */
  title: string;
  mode: PrintMode;
  /** "Black & white · Double-sided · Pages 1-3 · 2 copies", to set in the print dialog */
  options: string;
  canPrint: boolean;
};

let frame: HTMLIFrameElement | null = null;
let frameUrl: string | null = null;

/** Removes the previous print frame (kept until the next print, because closing the dialog doesn't tell us) */
function resetFrame() {
  frame?.remove();
  if (frameUrl) URL.revokeObjectURL(frameUrl);
  frame = null;
  frameUrl = null;
}

class FrameTimeout extends Error {}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Opens the browser's print dialog for the file exactly as uploaded (no changes to colours or pages).
 * The shop owner picks colour, sides, pages and copies in the dialog.
 */
async function openPrintDialog(url: string, mode: PrintMode, title: string): Promise<void> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(res.status === 410 ? "This file was deleted after 3 days." : "Couldn't load the file.");
  const blob = await res.blob();

  resetFrame();
  frameUrl = URL.createObjectURL(blob);
  frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";

  // If the browser can't show the file in a frame (e.g. its PDF viewer is turned off), open it in a tab instead
  const ready = new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new FrameTimeout()), 10_000);
    frame!.onload = () => {
      window.clearTimeout(timer);
      resolve();
    };
  });

  if (mode === "pdf") {
    frame.src = frameUrl;
  } else if (mode === "image") {
    frame.srcdoc = `<!doctype html><html><head><title>${escapeHtml(title)}</title><style>
      @page { margin: 8mm; } html, body { margin: 0; height: 100%; }
      body { display: flex; align-items: center; justify-content: center; }
      img { max-width: 100%; max-height: 100vh; object-fit: contain; }
    </style></head><body><img src="${frameUrl}" alt=""></body></html>`;
  } else {
    const text = await blob.text();
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
      @page { margin: 15mm; } body { margin: 0; }
      pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 11pt/1.45 Consolas, "Courier New", monospace; }
    </style></head><body><pre>${escapeHtml(text)}</pre></body></html>`;
  }
  document.body.appendChild(frame);
  await ready;

  const win = frame.contentWindow;
  if (!win) throw new Error("Couldn't open the print dialog.");
  // Give the browser's PDF viewer a moment to lay the pages out
  await new Promise((r) => setTimeout(r, mode === "pdf" ? 400 : 50));
  win.focus();
  win.print();
}

function download(url: string) {
  const a = document.createElement("a");
  a.href = `${url}?download=1`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function PrintFileButton({ fileId, fileName, title, mode, options, canPrint }: Props) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [, startTransition] = useTransition();
  const url = `/api/print/file/${fileId}`;
  // Phones and tablets can't print from a hidden frame; they open the file in a new tab instead
  const isTouch = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  async function print() {
    setBusy(true);
    setNote(null);
    try {
      if (mode === "download") {
        download(url);
        setNote({ tone: "ok", text: `Downloaded. Open it and press Ctrl+P, then choose: ${options}.` });
      } else if (isTouch()) {
        window.open(url, "_blank", "noopener");
        setNote({ tone: "ok", text: `Opened in a new tab. Print it from there with: ${options}.` });
      } else {
        setNote({ tone: "ok", text: `In the print dialog, choose: ${options}.` });
        try {
          await openPrintDialog(url, mode, title);
        } catch (err) {
          if (!(err instanceof FrameTimeout)) throw err;
          resetFrame();
          window.open(url, "_blank", "noopener");
          setNote({ tone: "ok", text: `Opened in a new tab. Press Ctrl+P there and choose: ${options}.` });
        }
      }
      startTransition(async () => {
        const result = await markPrinted(fileId);
        if (!result.ok) setNote({ tone: "error", text: result.error });
      });
    } catch (err) {
      setNote({ tone: "error", text: err instanceof Error ? err.message : "Couldn't print the file." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ap-pfile-actions">
      <div className="ap-pfile-buttons">
        {mode !== "download" && (
          <a className="ap-btn ap-btn-ghost ap-btn-sm" href={url} target="_blank" rel="noopener" title={`Open ${fileName} in a new tab`}>
            <Icon name="external" size={14} /> Open
          </a>
        )}
        {mode === "download" && !canPrint && (
          <a className="ap-btn ap-btn-ghost ap-btn-sm" href={`${url}?download=1`}>
            <Icon name="download" size={14} /> Download
          </a>
        )}
        {canPrint && (
          <button type="button" className="ap-btn ap-btn-gold ap-btn-sm" onClick={print} disabled={busy}>
            <Icon name={mode === "download" ? "download" : "printer"} size={15} />
            {busy ? "Opening…" : mode === "download" ? "Download to print" : "Print"}
          </button>
        )}
      </div>
      {note && (
        <p className={`ap-pfile-note is-${note.tone}`} role="status">
          {note.text}
        </p>
      )}
    </div>
  );
}
