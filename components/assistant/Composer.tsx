"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/admin/Icon";

/** Longest question accepted (the API route will check this too) */
export const MAX_LENGTH = 1000;

/** The language the mic listens for, so the browser writes down Telugu or Hindi words correctly */
const LANGUAGES = [
  { code: "en-IN", short: "EN", label: "English", english: "English (India)" },
  { code: "te-IN", short: "TE", label: "తెలుగు", english: "Telugu" },
  { code: "hi-IN", short: "HI", label: "हिन्दी", english: "Hindi" },
];

// The browser's speech recognition. TypeScript doesn't ship types for it, so just the parts we use.
type SpeechEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionClass = new () => Recognition;

function speechRecognition(): RecognitionClass | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** Why voice can't start at all in this browser */
type MicProblem = "unsupported" | "brave" | "insecure" | null;

const MIC_PROBLEMS = {
  // Brave has the speech API, but blocks the Google service behind it, so it always fails with "network"
  brave: "Brave blocks the speech service this uses, so voice can't work here. Open this page in Chrome or Edge to ask by voice.",
  unsupported: "This browser can't turn speech into text. Use Chrome or Edge to ask by voice (Firefox and Brave don't support it).",
  insecure: "The mic only works on a secure page: https:// or http://localhost. On a phone, open the deployed site instead of http://192.168…",
};

/** The browser's error codes, in plain words */
const MIC_ERRORS: Record<string, string> = {
  "not-allowed": "The microphone is blocked for this site. Click the icon at the left of the address bar, allow Microphone, then try again.",
  "service-not-allowed": "The browser's speech service is turned off or blocked. Try Chrome or Edge, signed in normally (not a guest window).",
  "audio-capture": "No microphone found. Plug one in, or check it's not being used by another app.",
  "no-speech": "Didn't hear anything. Tap the mic and speak straight away.",
  network:
    "Couldn't reach the speech service. Chrome sends your voice to Google to turn it into text, so it needs internet, and office networks or VPNs sometimes block it. Try Edge, or another network.",
  "language-not-supported": "This browser can't listen in that language. Try English.",
};

type Props = {
  busy: boolean;
  onSend: (text: string, voice: boolean) => void;
  onStop: () => void;
  /** Questions left today (the daily cap) */
  left: number;
};

export default function Composer({ busy, onSend, onStop, left }: Props) {
  const [text, setText] = useState("");
  // The mic listens for Telugu unless another language is picked
  const [lang, setLang] = useState("te-IN");
  /** null until checked in the browser (the server can't know) */
  const [micProblem, setMicProblem] = useState<MicProblem | undefined>(undefined);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState("");
  const [spoken, setSpoken] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const voice = useRef<HTMLDivElement>(null);
  const language = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  // Close the language menu on an outside click or Escape
  useEffect(() => {
    if (!langOpen) return;
    const onDown = (e: MouseEvent) => !voice.current?.contains(e.target as Node) && setLangOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); // so the side panel doesn't close as well
      setLangOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [langOpen]);

  // Only in the browser, after the first render, so the server and browser HTML match
  useEffect(() => {
    const isBrave = "brave" in navigator; // Brave adds navigator.brave
    setMicProblem(!speechRecognition() ? "unsupported" : isBrave ? "brave" : !window.isSecureContext ? "insecure" : null);
  }, []);
  // Stop listening when leaving the page
  useEffect(() => () => recognition.current?.stop(), []);

  // The box grows with the text, up to a limit (CSS max-height)
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const tooLong = text.length > MAX_LENGTH;
  const canSend = Boolean(text.trim()) && !tooLong && !busy && left > 0;

  function send() {
    if (!canSend) return;
    recognition.current?.stop();
    onSend(text.trim(), spoken);
    setText("");
    setSpoken(false);
  }

  function toggleMic() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    // Say why, instead of a mic button that does nothing
    if (micProblem) {
      setMicError(MIC_PROBLEMS[micProblem]);
      return;
    }
    const Speech = speechRecognition();
    if (!Speech) return;
    const r = new Speech();
    r.lang = lang;
    r.interimResults = true; // words appear while you talk
    r.continuous = false; // stops by itself after a pause
    const before = text.trim();
    r.onresult = (e) => {
      const heard = Array.from(e.results, (result) => result[0].transcript).join("");
      setText(before ? `${before} ${heard}` : heard);
      setSpoken(true);
    };
    r.onerror = (e) => {
      // "aborted" is us pressing stop; anything unknown shows its code so it can be looked up
      if (e.error !== "aborted") setMicError(MIC_ERRORS[e.error] ?? `Voice stopped (${e.error}). Try again.`);
    };
    r.onend = () => {
      setListening(false);
      recognition.current = null;
      box.current?.focus();
    };
    recognition.current = r;
    setMicError("");
    setListening(true);
    try {
      r.start();
    } catch (err) {
      // e.g. it's already listening in the other chat view
      recognition.current = null;
      setListening(false);
      setMicError(`Couldn't start the mic: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div className="as-composer">
      {micError && (
        <p className="ap-note ap-note-error as-micerror" role="alert">
          {micError}
        </p>
      )}
      <form
        className={`as-inputbox ${listening ? "is-listening" : ""} ${tooLong ? "is-invalid" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          ref={box}
          rows={1}
          value={text}
          placeholder={listening ? "Listening…" : "Ask about bookings, money, drivers, prints…"}
          aria-label="Your question"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter starts a new line (not while typing Telugu/Hindi with an IME)
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="as-inputbar">
          {micProblem !== undefined && (
            // One pill: the mic, and the language it listens for. Greyed out (but tappable, to say why) when voice can't work here.
            <div className={`as-voice ${listening ? "is-on" : ""} ${micProblem ? "is-off" : ""}`} ref={voice}>
              <button
                type="button"
                className="as-mic"
                onClick={toggleMic}
                aria-label={listening ? "Stop listening" : `Ask by voice in ${language.english}`}
                aria-pressed={listening}
                title={micProblem ? "Voice isn't available here" : listening ? "Stop listening" : `Ask by voice (${language.english})`}
              >
                <Icon name="mic" size={17} />
              </button>
              <button
                type="button"
                className="as-lang"
                onClick={() => setLangOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={langOpen}
                aria-label={`Language you'll speak: ${language.english}`}
                title="Language you'll speak"
                disabled={listening}
              >
                {language.short}
                <Icon name="chevron" size={12} className="as-lang-chevron" />
              </button>
              {langOpen && (
                <div className="as-langmenu" role="menu" aria-label="Language you'll speak">
                  <span className="as-langmenu-title">I'll speak in</span>
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      role="menuitemradio"
                      aria-checked={l.code === lang}
                      className={l.code === lang ? "is-selected" : ""}
                      onClick={() => {
                        setLang(l.code);
                        setLangOpen(false);
                      }}
                    >
                      <span className="as-langmenu-short">{l.short}</span>
                      <span className="as-langmenu-name">
                        <strong>{l.label}</strong>
                        <small>{l.english}</small>
                      </span>
                      {l.code === lang && <Icon name="check" size={15} />}
                    </button>
                  ))}
                  <p className="as-langmenu-note">The mic writes down what you say in this language.</p>
                </div>
              )}
            </div>
          )}
          <span className={`as-count ${tooLong ? "is-over" : ""}`}>
            {text.length > MAX_LENGTH * 0.8 ? `${text.length} / ${MAX_LENGTH}` : ""}
          </span>
          {busy ? (
            <button type="button" className="as-send is-stop" onClick={onStop} aria-label="Stop the reply" title="Stop">
              <Icon name="stop" size={16} />
            </button>
          ) : (
            <button type="submit" className="as-send" disabled={!canSend} aria-label="Send" title="Send">
              <Icon name="send" size={17} />
            </button>
          )}
        </div>
      </form>
      <p className="as-footnote">
        {left > 0 ? `${left} questions left today` : "No questions left today. The limit resets at midnight."} · Sample
        answers: nothing is read from or saved to your data yet.
      </p>
    </div>
  );
}
