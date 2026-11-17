"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/admin/Icon";
import { DAILY_LIMIT } from "@/lib/assistant/limits";
import { SUGGESTIONS } from "@/lib/assistant/suggestions";
import type { Chat } from "@/lib/assistant/types";
import { useAssist, VIEW_ONLY } from "./AssistProvider";
import Composer from "./Composer";
import History from "./History";
import MessageView from "./Message";

type Props = {
  /** "page": the full page. "panel": the side panel on every admin page. Both show the same chats. */
  variant?: "page" | "panel";
  /** Panel only: the close button */
  onClose?: () => void;
  /** Page only: a saved chat the server loaded, for its address /admin/assistant/<id> (5.3) */
  initialChat?: Chat;
};

/** One view of the chats: the chat list, the open chat and the message box */
export default function Assistant({ variant = "page", onClose, initialChat }: Props) {
  const { firstName, canUse, notify, chats, emptyId, live, asked, send, stop, confirmDraft, cancelDraft, deleteChat, renameChat, adopt, load, reveal } = useAssist();
  /** Viewers: buttons look greyed out but still take the click, to say why (a disabled button can't) */
  const locked = canUse ? {} : { "aria-disabled": true as const };
  const [activeId, setActiveId] = useState(initialChat?.id ?? emptyId);
  /** Full page on phones: the chat list drawer is open */
  const [historyOpen, setHistoryOpen] = useState(false);
  /** Side panel: showing the chat, or the list of chats in its place */
  const [view, setView] = useState<"chat" | "list">("chat");
  const scroller = useRef<HTMLDivElement>(null);
  /** Follow new text to the bottom, unless you scrolled up to read */
  const stick = useRef(true);

  // The chat the server loaded joins the chats here (shared with the side panel)…
  useEffect(() => {
    if (initialChat) adopt(initialChat);
  }, [initialChat]); // not adopt: it's a new function on every render, and only a new chat should run this

  // …and shows straight away, before that. A deleted (or unknown) chat falls back to the empty one.
  const stored = chats.find((c) => c.id === activeId);
  const active =
    (stored && !stored.unloaded ? stored : initialChat?.id === activeId ? initialChat : stored) ??
    chats.find((c) => c.id === emptyId) ??
    chats[0];
  const panel = variant === "panel";
  // A chat from the list, opened: its messages come from the server (5.4)
  const waiting = active.unloaded === true;
  useEffect(() => {
    if (waiting) load(active.id);
  }, [waiting, active.id]); // not load: a new function on every render

  // Full page: the address follows the open chat, so a reload or a bookmark comes back to it (5.3). A new chat
  // gets its address with its first question. replaceState changes the address without loading anything.
  const saved = active.messages.length > 0 || active.unloaded;
  useEffect(() => {
    if (panel) return;
    const address = saved ? `/admin/assistant/${active.id}` : "/admin/assistant";
    if (window.location.pathname !== address) window.history.replaceState(null, "", address);
  }, [panel, saved, active.id]);
  const listing = panel && view === "list";
  const savedCount = chats.filter((c) => c.messages.length > 0 || c.unloaded).length;
  const busy = live !== null;
  // The panel sits on pages that have their own <h1>
  const Title = panel ? "h2" : "h1";

  // A different chat (or coming back from the list) opens at its last message
  useEffect(() => {
    stick.current = true;
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [active.id, view]);

  // Keep the newest text in view while it arrives
  useEffect(() => {
    if (stick.current) scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [active.messages, live]);

  // Escape closes the chat list first (and not the whole side panel), but leaves it open while a popup
  // over it (e.g. "Delete this chat?") takes the Escape
  useEffect(() => {
    if (!historyOpen && !listing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector(".xp-modal-backdrop")) return;
      // Escape in a chat's name box (renaming) only cancels the rename
      if (e.target instanceof HTMLElement && e.target.classList.contains("as-history-name")) return;
      e.preventDefault();
      setHistoryOpen(false);
      setView("chat");
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [historyOpen, listing]);

  function ask(question: string, voice = false) {
    stick.current = true;
    send(active.id, question, voice);
  }

  function newChat() {
    if (!canUse) return notify(VIEW_ONLY.newChat);
    setHistoryOpen(false);
    setView("chat");
    setActiveId(emptyId);
  }

  function selectChat(chat: Pick<Chat, "id" | "title" | "when">) {
    reveal(chat); // a search can find a chat that isn't in the list yet
    setHistoryOpen(false);
    setView("chat");
    setActiveId(chat.id);
  }

  const fullPageHref = saved ? `/admin/assistant/${active.id}` : "/admin/assistant";

  const closeButton = (
    <>
      <span className="as-head-sep" aria-hidden="true" />
      <button type="button" className="as-tool" onClick={onClose} aria-label="Close Annapurna Assist" title="Close">
        <Icon name="close" size={18} />
      </button>
    </>
  );

  const header = listing ? (
    <header className="as-head">
      <button type="button" className="as-tool" onClick={() => setView("chat")} aria-label="Back to the chat" title="Back to the chat">
        <Icon name="chevron" size={18} className="xp-flip" />
      </button>
      <div className="as-head-text">
        <Title>Your chats</Title>
        <span className="as-head-sub">
          {savedCount} chat{savedCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="as-head-tools">{closeButton}</div>
    </header>
  ) : (
    <header className="as-head">
      {/* Full page on phones: opens the chat list drawer (the panel has its own button on the right) */}
      {!panel && (
        <button type="button" className="as-iconbtn as-history-open" onClick={() => setHistoryOpen(true)} aria-label="Your chats">
          <Icon name="clock" size={18} />
        </button>
      )}
      <span className="as-avatar is-lg" aria-hidden="true">
        <Icon name="sparkle" size={20} />
      </span>
      <div className="as-head-text">
        <Title>Annapurna Assist</Title>
        <span className="as-head-sub">
          Your business helper
        </span>
      </div>
      {panel ? (
        <div className="as-head-tools">
          <button type="button" className="as-tool" onClick={() => setView("list")} aria-label="Your chats" title="Your chats">
            <Icon name="clock" size={18} />
          </button>
          <button type="button" className="as-tool" onClick={newChat} aria-label="New chat" title="New chat" {...locked}>
            <Icon name="plus" size={18} />
          </button>
          <Link href={fullPageHref} className="as-tool" aria-label="Open the full page" title="Open the full page">
            <Icon name="external" size={17} />
          </Link>
          {closeButton}
        </div>
      ) : (
        <button type="button" className="ap-btn ap-btn-ghost ap-btn-sm as-head-new" onClick={newChat} {...locked}>
          <Icon name="plus" size={15} /> <span className="as-head-new-text">New chat</span>
        </button>
      )}
    </header>
  );

  const historyProps = { chats, activeId: active.id, onSelect: selectChat, onNew: newChat, onDelete: deleteChat, onRename: renameChat };

  return (
    <div className={`as-page ${panel ? "is-panel" : ""}`}>
      {/* Full page: the chat list on the left, with the Annapurna Assist name at its top */}
      {!panel && <History {...historyProps} open={historyOpen} onClose={() => setHistoryOpen(false)} />}

      <section className="as-main">
        {/* Full page on desktop hides this (the name is in the chat list); phones and the panel show it */}
        {header}

        {listing && <History {...historyProps} inline />}

        {/* Hidden (not removed) while the list shows, so a half-typed question and the scroll position stay */}
        <div className="as-chatbody" hidden={listing}>
          <div
            className="as-scroll"
            ref={scroller}
            onScroll={(e) => {
              const el = e.currentTarget;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
          >
            {waiting ? (
              <p className="ap-empty-sm as-loading">Loading chat…</p>
            ) : active.messages.length === 0 ? (
              <div className="as-welcome">
                <span className="as-welcome-mark" aria-hidden="true">
                  <Icon name="sparkle" size={30} />
                </span>
                <h2>Namaste, {firstName}</h2>
                <p>
                  {canUse
                    ? "Ask about bookings, money, drivers and vehicles, print orders, or how to use the admin. Before anything is saved, you'll see a draft to confirm."
                    : "You can look around here. Asking questions and confirming drafts is for admins."}
                </p>
                <div className="as-suggest">
                  {SUGGESTIONS.map((s) => (
                    <button key={s.text} type="button" onClick={() => ask(s.text)} disabled={busy} {...locked}>
                      <Icon name={s.icon} size={17} />
                      <span>{s.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="as-thread" aria-live="polite">
                {active.messages.map((m) => (
                  <MessageView
                    key={m.id}
                    message={m}
                    live={live?.messageId === m.id}
                    running={live?.messageId === m.id ? live.running : null}
                    onConfirm={confirmDraft}
                    onCancel={cancelDraft}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Waits while a chat's messages load, so a question can't land in it before its history */}
          <Composer busy={busy || waiting} onSend={ask} onStop={stop} left={DAILY_LIMIT - asked} />
        </div>
      </section>
    </div>
  );
}
