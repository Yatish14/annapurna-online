"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { cancelDraft as cancelOnServer, confirmDraft as confirmOnServer, type DraftActionResult } from "@/app/admin/assistant/actions";
import { useToast } from "@/components/Toaster";
import { DAILY_LIMIT } from "@/lib/assistant/limits";
import type { Card, Chat, Message, StreamEvent, ToolStep } from "@/lib/assistant/types";

type DraftCard = Extract<Card, { kind: "draft" }>;


let counter = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${counter++}`;

/**
 * A new chat's id: a random UUID, made here so the chat has its address (/admin/assistant/<id>) from the first
 * question. The server makes the chat for the signed-in admin when the first question arrives (5.2).
 */
const newChatId = () => crypto.randomUUID();

/** "10:42 am" in Indian time */
const clock = () =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true })
    .format(new Date())
    .toLowerCase();

const emptyChat = (id = newChatId()): Chat => ({ id, title: "New chat", when: "Today", messages: [] });

/** The first question becomes the chat's title (later Haiku writes a shorter one) */
const titleFrom = (q: string) => (q.length > 48 ? `${q.slice(0, 45).trimEnd()}…` : q);

/** A failure our route explained (over the free limit, Google down…): its message is meant for the admin */
class AssistError extends Error {}

/** What ask() reports while the answer arrives */
type Listeners = {
  /** The answer's words so far */
  text: (text: string) => void;
  /** A tool started or finished (the chips above the answer) */
  step: (event: Extract<StreamEvent, { type: "step" }>) => void;
  /** A card made from a tool's result (shown under the answer) */
  card: (card: Card) => void;
};

/**
 * Asks our server (app/api/assistant/route.ts), which asks Gemini, and tells `on` about each event as it
 * arrives: words, and tools starting and finishing. Stop cancels the request through `signal`, even halfway
 * through the reply. Throws an AssistError when the route says why it failed.
 */
async function ask(question: string, chatId: string, voice: boolean, signal: AbortSignal, on: Listeners): Promise<void> {
  // Only the question and which chat it's in: the server keeps the chat (Step 5) and reads the chat so far from
  // there, so nothing the browser says about earlier turns reaches the model
  const res = await fetch("/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: question, chatId, voice }),
    signal,
  });
  // Something went wrong: the route sends { error } with a message for the admin
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new AssistError(data.error ?? "Something went wrong. Please try again.");
  }

  // It worked: read the reply piece by piece as the server passes it on
  const reader = res.body.getReader();
  // Turns bytes back into text. `stream: true`: a Telugu letter (3 bytes) can be split across two pieces,
  // so the decoder holds on to half a letter until the rest arrives.
  const decoder = new TextDecoder();
  let text = "";
  // Each event is one line of JSON, but the network splits the stream wherever it likes: a piece can end in the
  // middle of a line. So keep what's left after the last "\n" and finish it with the next piece.
  let pending = "";
  const handle = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as StreamEvent;
    if (event.type === "text") {
      text += event.text;
      on.text(text);
    } else if (event.type === "step") {
      on.step(event);
    } else if (event.type === "card") {
      on.card(event.card);
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? ""; // the unfinished last line waits for the next piece
    lines.forEach(handle);
  }
  handle(pending + decoder.decode()); // anything still held
  if (!text.trim()) throw new AssistError("Gemini sent back an empty answer. Try asking another way.");
  on.text(text.trim());
}

/** The reply being written right now */
export type Live = { chatId: string; messageId: string; running: ToolStep | null };

/** What a viewer is told when they press something their role can't use */
export const VIEW_ONLY = {
  ask: "Viewers can read Annapurna Assist but can't ask questions. Ask the super admin if you need access.",
  newChat: "Viewers can't start new chats. Ask the super admin if you need access.",
  deleteChat: "Viewers can't delete chats. Ask the super admin if you need access.",
  draft: "Viewers can't confirm or cancel drafts. Ask the super admin if you need access.",
  form: "Viewers can't create or change bookings. Ask the super admin if you need access.",
};

type Store = {
  firstName: string;
  /** Can ask, start chats and confirm drafts (admins). Everyone else sees the same page, view only. */
  canUse: boolean;
  /** Shows a short message at the bottom of the screen */
  notify: (message: string) => void;
  chats: Chat[];
  /** The one empty chat that "New chat" opens. There's always exactly one. */
  emptyId: string;
  live: Live | null;
  /** Questions asked today */
  asked: number;
  send: (chatId: string, question: string, voice?: boolean) => void;
  stop: () => void;
  confirmDraft: (card: DraftCard) => void;
  cancelDraft: (card: DraftCard) => void;
  deleteChat: (id: string) => void;
  /** A saved chat the server loaded (the /admin/assistant/<id> page): kept, unless this browser already has it open */
  adopt: (chat: Chat) => void;
};

const AssistContext = createContext<Store | null>(null);

/** The chats, shared by the side panel and the full page, so a chat started in one carries on in the other */
export function useAssist(): Store {
  const store = useContext(AssistContext);
  if (!store) throw new Error("useAssist needs <AssistProvider> (app/admin/layout.tsx)");
  return store;
}

type Props = {
  firstName: string;
  canUse: boolean;
  initialChats: Chat[];
  /** Questions already asked today (from the database), so the count is right after a reload */
  askedToday: number;
  children: React.ReactNode;
};

export default function AssistProvider({ firstName, canUse, initialChats, askedToday, children }: Props) {
  // The empty chat's id is random, different on the server and in the browser, but it never shows in the page
  const [chats, setChats] = useState<Chat[]>(() => [emptyChat(), ...initialChats]);
  const [live, setLive] = useState<Live | null>(null);
  const [asked, setAsked] = useState(askedToday);
  const abort = useRef<AbortController | null>(null);
  // Messages (e.g. why a viewer can't do something) use the app's toasts (components/Toaster.tsx)
  const toasts = useToast();

  function notify(message: string) {
    toasts.notify(message, "info");
  }
  /** Drafts already confirmed or cancelled, so a double-click can't confirm twice */
  const settled = useRef(new Set<string>());

  const emptyId = chats.find((c) => c.messages.length === 0)?.id ?? chats[0].id;

  // Stop a reply that's still being written when leaving the admin
  useEffect(() => () => abort.current?.abort(), []);

  function updateMessage(chatId: string, messageId: string, change: (m: Message) => Message) {
    setChats((cs) =>
      cs.map((c) => (c.id === chatId ? { ...c, messages: c.messages.map((m) => (m.id === messageId ? change(m) : m)) } : c)),
    );
  }

  // Each action checks the role too, not just the greyed-out buttons
  // (the API route checks it again on the server, and later the server actions will too)
  function send(chatId: string, question: string, voice = false) {
    if (!canUse) return notify(VIEW_ONLY.ask);
    if (live || asked >= DAILY_LIMIT) return;
    const time = clock();
    const answer: Message = { id: newId("msg"), role: "assistant", text: "", time };

    // Add the question and an empty reply; this chat moves to the top of the list.
    // If it was the empty chat, a new empty one takes its place for the next "New chat".
    setChats((cs) => {
      const chat = cs.find((c) => c.id === chatId);
      if (!chat) return cs;
      const updated: Chat = {
        ...chat,
        title: chat.messages.length ? chat.title : titleFrom(question),
        when: "Today",
        messages: [...chat.messages, { id: newId("msg"), role: "user", text: question, time, voice }, answer],
      };
      const others = cs.filter((c) => c.id !== chatId);
      return chat.messages.length ? [updated, ...others] : [emptyChat(), updated, ...others];
    });
    setAsked((n) => n + 1);

    const controller = new AbortController();
    abort.current = controller;
    setLive({ chatId, messageId: answer.id, running: null });
    ask(question, chatId, voice, controller.signal, {
      // Each piece of the reply replaces the bubble's text with everything so far
      text: (text) => updateMessage(chatId, answer.id, (m) => ({ ...m, text })),
      // A tool started: show its chip with a spinner. It finished: add it to the ticked chips, stop the spinner.
      step: ({ state, step }) => {
        if (state === "running") return setLive({ chatId, messageId: answer.id, running: step });
        updateMessage(chatId, answer.id, (m) => ({ ...m, steps: [...(m.steps ?? []), step] }));
        setLive({ chatId, messageId: answer.id, running: null });
      },
      // A table from a tool's own data: added under the answer, in the order the tools finished
      card: (card) => updateMessage(chatId, answer.id, (m) => ({ ...m, cards: [...(m.cards ?? []), card] })),
    })
      .catch((err) =>
        updateMessage(chatId, answer.id, (m) => {
          // Stop pressed: keep the words so far, marked "Stopped". Not an error.
          if (controller.signal.aborted) return { ...m, stopped: true };
          // Otherwise keep any words that arrived and say why the rest didn't
          const error =
            err instanceof AssistError
              ? err.message // the route's own explanation
              : m.text
                ? "The reply was cut off halfway. Please try again." // the stream broke after some words
                : "I couldn't reach the server. Check your internet and try again."; // fetch itself failed
          return { ...m, error };
        }),
      )
      .finally(() => {
        setLive(null);
        abort.current = null;
      });
  }

  /** Changes a draft card wherever it is (its status, "Saving…", the result) */
  function settleDraft(id: string, change: Partial<DraftCard>) {
    setChats((cs) =>
      cs.map((c) => {
        const has = c.messages.some((m) => m.cards?.some((card) => card.kind === "draft" && card.id === id));
        if (!has) return c;
        const messages = c.messages.map((m) =>
          m.cards ? { ...m, cards: m.cards.map((card) => (card.kind === "draft" && card.id === id ? { ...card, ...change } : card)) } : m,
        );
        return { ...c, messages };
      }),
    );
  }

  /**
   * Confirm and Cancel: the server actions (app/admin/assistant/actions.ts) get only the draft's id and do the work
   * on the server: Confirm loads the values kept there, checks them again and saves; Cancel marks the draft
   * cancelled so nothing can confirm it later (4.11). A second click while one is working does nothing here, and
   * the server would refuse it anyway.
   */
  async function onServer(card: DraftCard, action: typeof confirmOnServer, done: (r: Extract<DraftActionResult, { ok: true }>) => Partial<DraftCard>) {
    if (!canUse) return notify(VIEW_ONLY.draft);
    if (settled.current.has(card.id)) return;
    settled.current.add(card.id);
    settleDraft(card.id, { saving: true });
    let result: DraftActionResult;
    try {
      result = await action(card.id);
    } catch {
      // No answer: it may or may not have happened, so don't offer to press again blindly
      result = { ok: false, error: "No answer from the server. Check the Bookings page before trying again." };
    }
    if (result.ok) {
      settleDraft(card.id, { saving: false, ...done(result) });
    } else if (result.card) {
      // The server knows better: saved in another tab, cancelled, or expired. The card shows that now.
      settleDraft(card.id, { saving: false, ...result.card });
      toasts.notify(result.error, "info");
    } else {
      settled.current.delete(card.id); // still a draft: it can be pressed again after fixing what's wrong
      settleDraft(card.id, { saving: false });
      toasts.notify(result.error, "error");
    }
  }

  function confirmDraft(card: DraftCard) {
    void onServer(card, confirmOnServer, (r) => ({ status: "confirmed", result: r.message, resultHref: r.href }));
  }

  function cancelDraft(card: DraftCard) {
    void onServer(card, cancelOnServer, () => ({ status: "cancelled" }));
  }

  function deleteChat(id: string) {
    if (!canUse) return notify(VIEW_ONLY.deleteChat);
    if (live?.chatId === id) abort.current?.abort();
    setChats((cs) => {
      const left = cs.filter((c) => c.id !== id);
      return left.some((c) => c.messages.length === 0) ? left : [emptyChat(), ...left];
    });
  }

  function adopt(chat: Chat) {
    setChats((cs) => {
      const known = cs.find((c) => c.id === chat.id);
      // Already open here (maybe still answering): this browser's copy is the newer one
      if (known && !known.unloaded) return cs;
      // In the list by title only: now with its messages. Not in the list (an older chat): at the end.
      return known ? cs.map((c) => (c.id === chat.id ? chat : c)) : [...cs, chat];
    });
  }

  const store: Store = {
    firstName,
    canUse,
    notify,
    chats,
    emptyId,
    live,
    asked,
    send,
    stop: () => abort.current?.abort(),
    confirmDraft,
    cancelDraft,
    deleteChat,
    adopt,
  };
  return (
    <AssistContext.Provider value={store}>
      {children}
    </AssistContext.Provider>
  );
}
