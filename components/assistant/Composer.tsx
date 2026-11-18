"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/admin/Icon";
// Longest question accepted; the API route checks it too
import { MAX_LENGTH } from "@/lib/assistant/limits";
// The languages the mic listens for, so the browser writes down Telugu or Hindi words correctly (shared with the
// server, which tells the model which one was spoken: 7.7)
import { LANGUAGES, type SpokenLanguage } from "@/lib/assistant/voice";
import { useAssist, VIEW_ONLY } from "./AssistProvider";

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

/** Where this browser remembers the "send when I stop talking" choice (7.5): a convenience, so per browser is enough */
const AUTO_SEND_KEY = "annapurna-assist-auto-send";

type Props = {
  busy: boolean;
  /** voice: the language it was spoken in, or null if it was typed */
  onSend: (text: string, voice: SpokenLanguage | null) => void;
  onStop: () => void;
  /** Questions left today (the daily cap) */
  left: number;
};

export default function Composer({ busy, onSend, onStop, left }: Props) {
  const [text, setText] = useState("");
  // The mic listens for Telugu unless another language is picked
  const [lang, setLang] = useState<SpokenLanguage>("te-IN");
  /** null until checked in the browser (the server can't know) */
  const [micProblem, setMicProblem] = useState<MicProblem | undefined>(undefined);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState("");
  /** The language of the words the mic put in the box, until it's sent (null: typed) */
  const [spoken, setSpoken] = useState<SpokenLanguage | null>(null);
  const [langOpen, setLangOpen] = useState(false);
  // 7.5: send the question by itself when you stop talking, or (the default) leave it in the box to check first.
  // Speech-to-text gets names and numbers wrong often enough that checking first is the safer default.
  const [autoSend, setAutoSend] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  /** Everything in the box at the last result, for sending when listening ends (state in the handler would be stale) */
  const heard = useRef("");
  const box = useRef<HTMLTextAreaElement>(null);
  const voice = useRef<HTMLDivElement>(null);
  const language = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];
  const { canUse, notify } = useAssist();
  /** Viewers: everything looks the same but greyed out; touching it says why */
  const locked = canUse ? {} : { "aria-disabled": true as const };
  const tellViewer = () => notify(VIEW_ONLY.ask);

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
  // The remembered choice (7.5). Storage can be blocked (private windows), so it's only ever a nice-to-have.
  useEffect(() => {
    try {
      setAutoSend(localStorage.getItem(AUTO_SEND_KEY) === "1");
    } catch {}
  }, []);
  function chooseAutoSend(on: boolean) {
    setAutoSend(on);
    try {
      localStorage.setItem(AUTO_SEND_KEY, on ? "1" : "0");
    } catch {}
  }

  // The box grows with the text, up to a limit (CSS max-height)
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const tooLong = text.length > MAX_LENGTH;
  const canSendText = (value: string) => Boolean(value.trim()) && value.length <= MAX_LENGTH && !busy && left > 0;
  const canSend = canSendText(text);

  function send(value = text, voice = spoken) {
    if (!canSendText(value)) return;
    recognition.current?.stop();
    onSend(value.trim(), voice);
    setText("");
    setSpoken(null);
    heard.current = "";
  }

  function toggleMic() {
    if (!canUse) return tellViewer();
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
    heard.current = "";
    r.onresult = (e) => {
      const words = Array.from(e.results, (result) => result[0].transcript).join("");
      heard.current = before ? `${before} ${words}` : words;
      setText(heard.current);
      setSpoken(r.lang as SpokenLanguage);
    };
    r.onerror = (e) => {
      // "aborted" is us pressing stop; anything unknown shows its code so it can be looked up
      if (e.error !== "aborted") setMicError(MIC_ERRORS[e.error] ?? `Voice stopped (${e.error}). Try again.`);
    };
    r.onend = () => {
      setListening(false);
      recognition.current = null;
      // 7.5: sent as soon as you stop talking, if chosen and something was heard; otherwise it waits in the box
      if (autoSend && heard.current) send(heard.current, r.lang as SpokenLanguage);
      else box.current?.focus();
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
        className={`as-inputbox ${listening ? "is-listening" : ""} ${tooLong ? "is-invalid" : ""} ${canUse ? "" : "is-locked"}`}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          ref={box}
          rows={1}
          value={text}
          placeholder={
            !canUse ? "View only: your role can't ask questions" : listening ? "Listening…" : "Ask about bookings, money, drivers, prints…"
          }
          aria-label="Your question"
          readOnly={!canUse}
          {...locked}
          onMouseDown={(e) => {
            if (canUse) return;
            e.preventDefault(); // no cursor in a box that can't be typed in
            tellViewer();
          }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (!canUse) {
              if (e.key !== "Tab") tellViewer(); // Tab still moves on
              return;
            }
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
                {...locked}
                aria-label={listening ? "Stop listening" : `Ask by voice in ${language.english}`}
                aria-pressed={listening}
                title={micProblem ? "Voice isn't available here" : listening ? "Stop listening" : `Ask by voice (${language.english})`}
              >
                <Icon name="mic" size={17} />
              </button>
              <button
                type="button"
                className="as-lang"
                onClick={() => (canUse ? setLangOpen((o) => !o) : tellViewer())}
                {...locked}
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
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={autoSend}
                    className={`as-langmenu-auto ${autoSend ? "is-selected" : ""}`}
                    onClick={() => chooseAutoSend(!autoSend)}
                  >
                    <span className="as-langmenu-name">
                      <strong>Send when I stop talking</strong>
                      <small>{autoSend ? "Sent straight away" : "Off: check the words, then press Send"}</small>
                    </span>
                    {autoSend && <Icon name="check" size={15} />}
                  </button>
                </div>
              )}
            </div>
          )}
          <span className={`as-count ${tooLong ? "is-over" : ""}`}>
            {text.length > MAX_LENGTH * 0.8 ? `${text.length} / ${MAX_LENGTH}` : ""}
          </span>
          {!canUse ? (
            // Not a real disabled button: those can't be clicked, so they couldn't say why
            <button type="button" className="as-send" onClick={tellViewer} aria-label="Send" title="Send" {...locked}>
              <Icon name="send" size={17} />
            </button>
          ) : busy ? (
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
        {!canUse
          ? "View only: asking questions is for admins."
          : left > 0
            ? `${left} questions left today`
            : "No questions left today. The limit resets at midnight."}{" "}
        · Gemini answers, but can&apos;t see your data yet.
      </p>
    </div>
  );
}
