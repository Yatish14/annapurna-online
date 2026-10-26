"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { sampleConfirm, sampleReply } from "@/lib/assistant/sample";
import type { Card, Chat, Message, Reply, ToolStep } from "@/lib/assistant/types";

type DraftCard = Extract<Card, { kind: "draft" }>;

/** Questions one admin can ask per day (the API route will enforce it; this only shows it) */
export const DAILY_LIMIT = 50;

let counter = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${counter++}`;

/** "10:42 am" in Indian time */
const clock = () =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true })
    .format(new Date())
    .toLowerCase();

const emptyChat = (id = newId("chat")): Chat => ({ id, title: "New chat", when: "Today", messages: [] });

/** The first question becomes the chat's title (later Haiku writes a shorter one) */
const titleFrom = (q: string) => (q.length > 48 ? `${q.slice(0, 45).trimEnd()}…` : q);

/** Waits, unless Stop is pressed first */
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
}

/** The reply being written right now */
export type Live = { chatId: string; messageId: string; running: ToolStep | null };

type Store = {
  firstName: string;
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
};

const AssistContext = createContext<Store | null>(null);

/** The chats, shared by the side panel and the full page, so a chat started in one carries on in the other */
export function useAssist(): Store {
  const store = useContext(AssistContext);
  if (!store) throw new Error("useAssist needs <AssistProvider> (app/admin/layout.tsx)");
  return store;
}

type Props = { firstName: string; today: string; initialChats: Chat[]; children: React.ReactNode };

export default function AssistProvider({ firstName, today, initialChats, children }: Props) {
  // A fixed id for the first empty chat, so the server and the browser render the same thing
  const [chats, setChats] = useState<Chat[]>(() => [emptyChat("chat-new"), ...initialChats]);
  const [live, setLive] = useState<Live | null>(null);
  const [asked, setAsked] = useState(0);
  const abort = useRef<AbortController | null>(null);
  /** Drafts already confirmed or cancelled, so a double-click can't confirm twice */
  const settled = useRef(new Set<string>());

  const emptyId = chats.find((c) => c.messages.length === 0)?.id ?? "chat-new";

  // Stop a reply that's still being written when leaving the admin
  useEffect(() => () => abort.current?.abort(), []);

  function updateMessage(chatId: string, messageId: string, change: (m: Message) => Message) {
    setChats((cs) =>
      cs.map((c) => (c.id === chatId ? { ...c, messages: c.messages.map((m) => (m.id === messageId ? change(m) : m)) } : c)),
    );
  }

  /** Shows a reply the way a streamed one arrives: tool chips first, then the words, then the cards */
  async function play(chatId: string, messageId: string, reply: Reply, signal: AbortSignal) {
    await wait(450, signal);
    for (const step of reply.steps ?? []) {
      setLive({ chatId, messageId, running: step });
      await wait(650, signal);
      updateMessage(chatId, messageId, (m) => ({ ...m, steps: [...(m.steps ?? []), step] }));
    }
    setLive({ chatId, messageId, running: null });
    const words = reply.text.match(/\S+\s*/g) ?? [];
    for (let i = 1; i <= words.length; i++) {
      await wait(28, signal);
      const text = words.slice(0, i).join("");
      updateMessage(chatId, messageId, (m) => ({ ...m, text }));
    }
    updateMessage(chatId, messageId, (m) => ({ ...m, cards: reply.cards }));
  }

  function send(chatId: string, question: string, voice = false) {
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
    play(chatId, answer.id, sampleReply(question, today, newId("draft")), controller.signal)
      .catch(() => updateMessage(chatId, answer.id, (m) => ({ ...m, stopped: true })))
      .finally(() => {
        setLive(null);
        abort.current = null;
      });
  }

  /** Changes a draft card wherever it is, and adds a message after it in the same chat */
  function settleDraft(id: string, change: Partial<DraftCard>, followUp?: Message) {
    setChats((cs) =>
      cs.map((c) => {
        const has = c.messages.some((m) => m.cards?.some((card) => card.kind === "draft" && card.id === id));
        if (!has) return c;
        const messages = c.messages.map((m) =>
          m.cards ? { ...m, cards: m.cards.map((card) => (card.kind === "draft" && card.id === id ? { ...card, ...change } : card)) } : m,
        );
        return { ...c, messages: followUp ? [...messages, followUp] : messages };
      }),
    );
  }

  function confirmDraft(card: DraftCard) {
    if (settled.current.has(card.id)) return;
    settled.current.add(card.id);
    const { result, reply } = sampleConfirm(card);
    // The result goes back into the chat, so the conversation carries on from it
    settleDraft(card.id, { status: "confirmed", result }, { id: newId("msg"), role: "assistant", text: reply, time: clock() });
  }

  function cancelDraft(card: DraftCard) {
    if (settled.current.has(card.id)) return;
    settled.current.add(card.id);
    settleDraft(card.id, { status: "cancelled" });
  }

  function deleteChat(id: string) {
    if (live?.chatId === id) abort.current?.abort();
    setChats((cs) => {
      const left = cs.filter((c) => c.id !== id);
      return left.some((c) => c.messages.length === 0) ? left : [emptyChat(), ...left];
    });
  }

  const store: Store = {
    firstName,
    chats,
    emptyId,
    live,
    asked,
    send,
    stop: () => abort.current?.abort(),
    confirmDraft,
    cancelDraft,
    deleteChat,
  };
  return <AssistContext.Provider value={store}>{children}</AssistContext.Provider>;
}
