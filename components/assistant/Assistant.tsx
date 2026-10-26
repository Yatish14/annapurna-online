"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/admin/Icon";
import { SUGGESTIONS } from "@/lib/assistant/sample";
import { DAILY_LIMIT, useAssist, VIEW_ONLY } from "./AssistProvider";
import Composer from "./Composer";
import History from "./History";
import MessageView from "./Message";

type Props = {
  /** "page": the full page. "panel": the side panel on every admin page. Both show the same chats. */
  variant?: "page" | "panel";
  /** Panel only: the close button */
  onClose?: () => void;
  /** Page only: open this chat first (the panel's "Open the full page" link sends it) */
  initialChatId?: string;
};

/** One view of the chats: the chat list, the open chat and the message box */
export default function Assistant({ variant = "page", onClose, initialChatId }: Props) {
  const { firstName, canUse, notify, chats, emptyId, live, asked, send, stop, confirmDraft, cancelDraft, deleteChat } = useAssist();
  /** Viewers: buttons look greyed out but still take the click, to say why (a disabled button can't) */
  const locked = canUse ? {} : { "aria-disabled": true as const };
  const [activeId, setActiveId] = useState(initialChatId ?? emptyId);
  /** Full page on phones: the chat list drawer is open */
  const [historyOpen, setHistoryOpen] = useState(false);
  /** Side panel: showing the chat, or the list of chats in its place */
  const [view, setView] = useState<"chat" | "list">("chat");
  const scroller = useRef<HTMLDivElement>(null);
  /** Follow new text to the bottom, unless you scrolled up to read */
  const stick = useRef(true);

  // A deleted (or unknown) chat falls back to the empty one
  const active = chats.find((c) => c.id === activeId) ?? chats.find((c) => c.id === emptyId) ?? chats[0];
  const panel = variant === "panel";
  const listing = panel && view === "list";
  const savedCount = chats.filter((c) => c.messages.length > 0).length;
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

  // Escape closes the chat list first (and not the whole side panel)
  useEffect(() => {
    if (!historyOpen && !listing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
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

  function selectChat(id: string) {
    setHistoryOpen(false);
    setView("chat");
    setActiveId(id);
  }

  const fullPageHref = active.messages.length ? `/admin/assistant?chat=${encodeURIComponent(active.id)}` : "/admin/assistant";

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
          <span className="ap-badge is-sample">Sample</span>
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
          <span className="ap-badge is-sample">Sample</span>
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

  const historyProps = { chats, activeId: active.id, onSelect: selectChat, onNew: newChat, onDelete: deleteChat };

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
            {active.messages.length === 0 ? (
              <div className="as-welcome">
                <span className="as-welcome-mark" aria-hidden="true">
                  <Icon name="sparkle" size={30} />
                </span>
                <h2>Namaste, {firstName}</h2>
                <p>
                  {canUse
                    ? "Ask about bookings, money, drivers and vehicles, print orders, or how to use the admin. Before anything is saved, you'll see a draft to confirm."
                    : "You can read the chats here. Asking questions and confirming drafts is for admins."}
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

          <Composer busy={busy} onSend={ask} onStop={stop} left={DAILY_LIMIT - asked} />
        </div>
      </section>
    </div>
  );
}
