"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { reserveUploads, submitOrder } from "@/app/print/actions";
import { BUSINESS } from "@/lib/config";
import {
  ACCEPT,
  checkFile,
  COLOR_LABELS,
  DEFAULT_OPTIONS,
  fileTypeOf,
  formatSize,
  normalizePageRange,
  PRINT_LIMITS,
  PRINT_SHOP,
  SIDES_LABELS,
  type ColorMode,
  type PrintOptions,
  type Sides,
} from "@/lib/print/files";
import Icon from "../admin/Icon";
import MobileInput, { type MobileInputHandle } from "../MobileInput";

type Item = {
  id: number;
  file: File;
  options: PrintOptions;
  /** "custom" shows the page-range box */
  pageMode: "all" | "custom";
  preview?: string;
};

type Phase = { step: "idle" } | { step: "uploading"; current: number; percent: number[] } | { step: "saving" };

let nextId = 1;

function Segmented<T extends string>({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="pp-seg">
      <legend>{label}</legend>
      <div>
        {options.map((o) => (
          <label key={o.value} className={value === o.value ? "is-on" : ""}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function uploadLocal(key: string, file: File, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/print/upload-local?key=${encodeURIComponent(key)}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress((e.loaded / e.total) * 100);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error("Upload failed. Please try again.")));
    xhr.onerror = () => reject(new Error("Upload failed. Check your internet connection and try again."));
    xhr.send(file);
  });
}

function FileCard({
  item,
  index,
  disabled,
  onChange,
  onRemove,
}: {
  item: Item;
  index: number;
  disabled: boolean;
  onChange: (patch: Partial<Item>) => void;
  onRemove: () => void;
}) {
  const uid = useId();
  const type = fileTypeOf(item.file.name);
  const isImage = Boolean(type?.image);
  const o = item.options;
  const setOption = (patch: Partial<PrintOptions>) => onChange({ options: { ...o, ...patch } });
  const pagesInvalid = item.pageMode === "custom" && normalizePageRange(o.pages) === null;

  return (
    <li className="pp-file">
      <div className="pp-file-head">
        {item.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="pp-thumb" src={item.preview} alt="" />
        ) : (
          <span className="pp-thumb pp-thumb-doc">
            <Icon name="file" size={20} />
            <small>{item.file.name.split(".").pop()?.slice(0, 4)}</small>
          </span>
        )}
        <div className="pp-file-name">
          <strong title={item.file.name}>{item.file.name}</strong>
          <span>
            {type?.label ?? "File"} · {formatSize(item.file.size)}
          </span>
        </div>
        <button type="button" className="pp-remove" onClick={onRemove} disabled={disabled} aria-label={`Remove ${item.file.name}`}>
          <Icon name="close" size={18} />
        </button>
      </div>

      <fieldset className="pp-options" disabled={disabled}>
        <Segmented<ColorMode>
          label="Print in"
          name={`color-${uid}`}
          value={o.color}
          onChange={(color) => setOption({ color })}
          options={[
            { value: "bw", label: COLOR_LABELS.bw },
            { value: "color", label: COLOR_LABELS.color },
          ]}
        />
        <Segmented<Sides>
          label="Sides"
          name={`sides-${uid}`}
          value={o.sides}
          onChange={(sides) => setOption({ sides })}
          options={[
            { value: "single", label: SIDES_LABELS.single },
            { value: "double", label: SIDES_LABELS.double },
          ]}
        />
        {!isImage && (
          <div className="pp-pages">
            <Segmented<"all" | "custom">
              label="Pages"
              name={`pages-${uid}`}
              value={item.pageMode}
              onChange={(pageMode) => onChange({ pageMode, options: { ...o, pages: pageMode === "all" ? "" : o.pages } })}
              options={[
                { value: "all", label: "All pages" },
                { value: "custom", label: "Choose pages" },
              ]}
            />
            {item.pageMode === "custom" && (
              <label className={`pp-input ${pagesInvalid && o.pages ? "is-invalid" : ""}`}>
                <span className="pp-sr">Pages to print for file {index + 1}</span>
                <input
                  value={o.pages}
                  onChange={(e) => setOption({ pages: e.target.value })}
                  inputMode="numeric"
                  placeholder="e.g. 1-3, 5"
                  maxLength={60}
                  autoFocus
                />
              </label>
            )}
            {item.pageMode === "custom" && pagesInvalid && o.pages && <p className="pp-field-error">Write pages like 1-3, 5</p>}
          </div>
        )}
        <div className="pp-copies">
          <span className="pp-legend">Copies</span>
          <div className="pp-stepper">
            <button type="button" onClick={() => setOption({ copies: Math.max(1, o.copies - 1) })} aria-label="Fewer copies" disabled={o.copies <= 1}>
              −
            </button>
            <output aria-live="polite">{o.copies}</output>
            <button type="button" onClick={() => setOption({ copies: Math.min(99, o.copies + 1) })} aria-label="More copies" disabled={o.copies >= 99}>
              +
            </button>
          </div>
        </div>
      </fieldset>
    </li>
  );
}

/** What happens to the customer's files and details (shown before they send anything) */
function PrivacyNote() {
  return (
    <section className="pp-privacy" aria-labelledby="pp-privacy-title">
      <h2 id="pp-privacy-title">
        <Icon name="shield" size={17} /> Your privacy
      </h2>
      <ul>
        <li>We use your files only to print this order, and never share them.</li>
        <li>
          Files are stored privately (only our staff can open them) and are <b>deleted automatically {PRINT_SHOP.keepDays} days</b> after
          upload.
        </li>
        <li>Your name and mobile number are optional, and used only to contact you about this order.</li>
        <li>
          Want your files deleted sooner? Ask at the counter or call <a href={`tel:+91${BUSINESS.phone}`}>{BUSINESS.phoneDisplay}</a>.
        </li>
      </ul>
      <p>By sending your files, you agree to this.</p>
    </section>
  );
}

export default function Uploader() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ step: "idle" });
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const phoneField = useRef<MobileInputHandle>(null);
  const previews = useRef(new Set<string>());
  const busy = phase.step !== "idle";

  // Free the image previews when leaving the page
  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const errors: string[] = [];
    const added: Item[] = [];
    for (const file of Array.from(list)) {
      if (items.length + added.length >= PRINT_LIMITS.maxFiles) {
        errors.push(`You can send up to ${PRINT_LIMITS.maxFiles} files at a time.`);
        break;
      }
      const check = checkFile(file.name, file.size);
      if (!check.ok) {
        errors.push(check.error);
        continue;
      }
      let preview: string | undefined;
      if (check.type.mode === "image") {
        preview = URL.createObjectURL(file);
        previews.current.add(preview);
      }
      added.push({ id: nextId++, file, options: { ...DEFAULT_OPTIONS }, pageMode: "all", preview });
    }
    setItems((prev) => [...prev, ...added]);
    setError(errors.length ? errors.join(" ") : null);
  }

  function removeItem(id: number) {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.preview) {
        URL.revokeObjectURL(item.preview);
        previews.current.delete(item.preview);
      }
      return prev.filter((i) => i.id !== id);
    });
  }

  async function send() {
    setError(null);
    for (const item of items) {
      if (item.pageMode === "custom" && !normalizePageRange(item.options.pages)) {
        setError(`${item.file.name}: write the pages to print, like 1-3, 5 (or choose "All pages").`);
        return;
      }
    }
    // Optional, but if given it must be a valid number; the field turns red and gets the cursor
    if (!phoneField.current?.check()) {
      setError("Enter a valid 10-digit mobile number (starting with 6, 7, 8 or 9), or leave it empty.");
      return;
    }

    setPhase({ step: "uploading", current: 0, percent: items.map(() => 0) });
    try {
      const reserved = await reserveUploads(items.map((i) => ({ name: i.file.name, size: i.file.size })));
      if (!reserved.ok) throw new Error(reserved.error);

      const blobClient = reserved.mode === "blob" ? await import("@vercel/blob/client") : null;
      const percent = items.map(() => 0);
      for (let i = 0; i < items.length; i++) {
        const { file } = items[i];
        const key = reserved.keys[i];
        const onProgress = (p: number) => {
          percent[i] = Math.min(100, p);
          setPhase({ step: "uploading", current: i, percent: [...percent] });
        };
        if (blobClient) {
          await blobClient.uploadPresigned(key, file, {
            access: reserved.access,
            handleUploadUrl: "/api/print/upload",
            contentType: fileTypeOf(file.name)?.mime,
            onUploadProgress: ({ percentage }) => onProgress(percentage),
          });
        } else {
          await uploadLocal(key, file, onProgress);
        }
        onProgress(100);
      }

      setPhase({ step: "saving" });
      const result = await submitOrder({
        name,
        phone,
        files: items.map((item, i) => ({
          key: reserved.keys[i],
          name: item.file.name,
          options: { ...item.options, pages: item.pageMode === "custom" ? item.options.pages : "" },
        })),
      });
      if (!result.ok) throw new Error(result.error);
      router.push(`/print/order/${result.publicId}?new=1`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(
        message && !/fetch|network/i.test(message)
          ? message
          : "Upload failed. Check your internet connection and try again.",
      );
      setPhase({ step: "idle" });
    }
  }

  const totalSize = items.reduce((sum, i) => sum + i.file.size, 0);
  const overall =
    phase.step === "uploading"
      ? Math.round(
          phase.percent.reduce((sum, p, i) => sum + (p / 100) * items[i].file.size, 0) / Math.max(1, totalSize) * 100,
        )
      : phase.step === "saving"
        ? 100
        : 0;

  return (
    <div className="pp-uploader">
      <div
        className={`pp-drop ${dragging ? "is-dragging" : ""} ${items.length ? "is-compact" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) addFiles(e.dataTransfer.files);
        }}
      >
        <span className="pp-drop-icon">
          <Icon name="file" size={26} />
        </span>
        <div className="pp-drop-text">
          <strong>{items.length ? "Add more files" : "Choose the files to print"}</strong>
          <span>
            PDF, Word, Excel, PowerPoint, text or photos · up to {PRINT_LIMITS.maxFileMB} MB each · {PRINT_LIMITS.maxFiles} files max
          </span>
        </div>
        <div className="pp-drop-actions">
          <button type="button" className="pp-btn pp-btn-gold" onClick={() => fileInput.current?.click()} disabled={busy || items.length >= PRINT_LIMITS.maxFiles}>
            <Icon name="plus" size={18} /> Choose files
          </button>
          <button type="button" className="pp-btn pp-btn-ghost" onClick={() => cameraInput.current?.click()} disabled={busy || items.length >= PRINT_LIMITS.maxFiles}>
            <Icon name="image" size={18} /> Take a photo
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <p className="pp-error" role="alert">
          {error}
        </p>
      )}

      {items.length > 0 && (
        <>
          <ol className="pp-files">
            {items.map((item, i) => (
              <FileCard
                key={item.id}
                item={item}
                index={i}
                disabled={busy}
                onChange={(patch) => setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, ...patch } : p)))}
                onRemove={() => removeItem(item.id)}
              />
            ))}
          </ol>

          <section className="pp-card pp-details">
            <h2>Your details <span>(optional)</span></h2>
            <p>So we can call you if there's a problem with a file.</p>
            <div className="pp-details-grid">
              <label className="pp-input">
                <span>Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" disabled={busy} />
              </label>
              <label className="pp-input">
                <span>Mobile number</span>
                <MobileInput value={phone} onChange={setPhone} handle={phoneField} placeholder="10-digit number" disabled={busy} />
              </label>
            </div>
          </section>

          <PrivacyNote />

          <div className="pp-sendbar">
            <div className="pp-sendbar-inner">
              <span>
                <strong>
                  {items.length} file{items.length === 1 ? "" : "s"}
                </strong>{" "}
                · {formatSize(totalSize)}
              </span>
              <button type="button" className="pp-btn pp-btn-gold pp-btn-lg" onClick={send} disabled={busy}>
                {busy ? "Sending…" : "Send for printing"} <Icon name="arrow" size={18} />
              </button>
            </div>
          </div>
        </>
      )}

      {items.length === 0 && <PrivacyNote />}

      {busy && (
        <div className="pp-progress" role="dialog" aria-modal="true" aria-labelledby="pp-progress-title">
          <div className="pp-progress-card">
            <div className="pp-ring" style={{ "--p": overall } as React.CSSProperties}>
              <span>{overall}%</span>
            </div>
            <h2 id="pp-progress-title">{phase.step === "saving" ? "Almost done…" : "Uploading your files"}</h2>
            <p>Please keep this page open.</p>
            <ul>
              {items.map((item, i) => {
                const p = phase.step === "uploading" ? phase.percent[i] : 100;
                return (
                  <li key={item.id}>
                    <span>{item.file.name}</span>
                    <i>
                      <b style={{ width: `${p}%` }} />
                    </i>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
