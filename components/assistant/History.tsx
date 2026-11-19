"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { findChats } from "@/app/admin/assistant/actions";
import ConfirmDialog from "@/components/ConfirmDialog";
import Icon from "@/components/admin/Icon";
import type { FoundChat } from "@/lib/assistant/chatStore";
import type { Chat } from "@/lib/assistant/types";
import { useAssist, VIEW_ONLY } from "./AssistProvider";

type Props = {
  chats: Chat[];
  activeId: string;
  /**
   * false (full page): a column on the left (a drawer on phones), New chat at the top.
   * true (side panel): fills the panel in place of the chat, New chat fixed at the bottom.
   */
  inline?: boolean;
  /** Full page on phones: the drawer is open */
  open?: boolean;
  onClose?: () => void;
  /** A chat to open: from the list, or found by a search (then maybe not in the list yet) */
  onSelect: (chat: Pick<Chat, "id" | "title" | "when">) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
};

/** Your earlier chats, newest first, grouped by day, with a search box */
export default function History({ chats, activeId, inline, open, onClose, onSelect, onNew, onDelete, onRename }: Props) {
  const [query, setQuery] = useState("");
  /** The chat whose delete button was pressed, waiting for "Delete" in the popup */
  const [deleting, setDeleting] = useState<Pick<Chat, "id" | "title"> | null>(null);
  /** The chat being renamed (its title is a box), and the name typed so far */
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  /** Enter or leaving the box saves; Escape puts the old name back */
  function finishRename(save: boolean) {
    if (renaming && save) onRename(renaming.id, renaming.name);
    setRenaming(null);
  }
  const { canUse, canSeeUsage, notify } = useAssist();
  /** Viewers: greyed out, but the click still says why */
  const locked = canUse ? {} : { "aria-disabled": true as const };

  const q = query.trim().toLowerCase();
  // Saved chats: open ones, and ones listed by title whose messages load when opened
  const saved = chats.filter((c) => c.messages.length > 0 || c.unloaded);
  const inList = new Set(saved.map((c) => c.id));

  // Search (5.8): the server looks through every chat's title and messages, a moment after typing stops. Until
  // its results arrive, the titles already here are filtered as you type.
  const [found, setFound] = useState<{ q: string; chats: FoundChat[] } | null>(null);
  useEffect(() => {
    if (q.length < 2) return;
    let stale = false;
    const wait = setTimeout(() => {
      findChats(q)
        .then((chats) => !stale && setFound({ q, chats }))
        .catch(() => undefined); // the titles filtered here stay
    }, 250);
    return () => {
      stale = true; // typed on: an older search's answer mustn't replace a newer one
      clearTimeout(wait);
    };
  }, [q]);
  const fromServer = q.length >= 2 && found?.q === q ? found.chats : null;
  const shown: (Pick<Chat, "id" | "title" | "when"> & { snippet?: string | null })[] =
    fromServer ?? (q ? saved.filter((c) => c.title.toLowerCase().includes(q)) : saved);

  // "Today" → [chats], "Yesterday" → [chats] … in the order they first appear
  const groups = new Map<string, typeof shown>();
  for (const c of shown) groups.set(c.when, [...(groups.get(c.when) ?? []), c]);

  const search = (
    <label className="ap-search as-history-search">
      <Icon name="search" size={16} />
      <input type="search" placeholder="Search chats" value={query} onChange={(e) => setQuery(e.target.value)} />
    </label>
  );

  const list = (
    <nav className="as-history-list" aria-label="Your chats">
      {groups.size === 0 && <p className="ap-empty-sm">{q ? "No chats match." : "Your chats will show here."}</p>}
      {[...groups].map(([when, items]) => (
        <div key={when} className="as-history-group">
          <h3>{when}</h3>
          <ul>
            {items.map((c) => (
              <li key={c.id} className={c.id === activeId ? "is-active" : ""}>
                {renaming?.id === c.id ? (
                  <input
                    className="as-history-name"
                    aria-label="New name for the chat"
                    value={renaming.name}
                    maxLength={80}
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setRenaming({ id: c.id, name: e.target.value })}
                    onBlur={() => finishRename(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") finishRename(true);
                      if (e.key === "Escape") {
                        e.preventDefault(); // the chat list stays open: this Escape was for the name
                        e.stopPropagation();
                        finishRename(false);
                      }
                    }}
                  />
                ) : (
                  <button type="button" className="as-history-item" onClick={() => onSelect(c)}>
                    {c.title}
                    {/* A search result: the bit of a message that matched */}
                    {c.snippet && <small className="as-history-snippet">{c.snippet}</small>}
                  </button>
                )}
                {/* Rename and delete: chats in the list (a search can find older ones; open those first) */}
                {inList.has(c.id) && (
                  <>
                <button
                  type="button"
                  className="as-history-rename"
                  aria-label={`Rename “${c.title}”`}
                  title="Rename chat"
                  {...locked}
                  onClick={() => {
                    if (!canUse) return notify(VIEW_ONLY.renameChat);
                    setRenaming({ id: c.id, name: c.title });
                  }}
                >
                  <Icon name="edit" size={14} />
                </button>
                <button
                  type="button"
                  className="as-history-delete"
                  aria-label={`Delete “${c.title}”`}
                  title="Delete chat"
                  {...locked}
                  onClick={() => {
                    // Viewers get the message straight away, not the "Delete?" popup first
                    if (!canUse) return notify(VIEW_ONLY.deleteChat);
                    setDeleting(c);
                  }}
                >
                  <Icon name="trash" size={14} />
                </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  // "Delete this chat?" as a popup over the page (components/ConfirmDialog.tsx)
  const popup = deleting && (
    <ConfirmDialog
      title={`Delete “${deleting.title}”?`}
      message="The chat and all its messages will be gone. This can't be undone."
      confirmLabel={
        <>
          <Icon name="trash" size={15} /> Delete
        </>
      }
      danger
      icon="trash"
      onCancel={() => setDeleting(null)}
      onConfirm={() => {
        onDelete(deleting.id);
        setDeleting(null);
      }}
    />
  );

  const newChat = (className: string) => (
    <button type="button" className={`ap-btn ap-btn-gold ${className}`} onClick={onNew} {...locked}>
      <Icon name="plus" size={16} /> New chat
    </button>
  );

  if (inline) {
    return (
      <div className="as-chatlist">
        <div className="as-chatlist-top">{search}</div>
        {list}
        <div className="as-chatlist-foot">{newChat("ap-btn-block")}</div>
        {popup}
      </div>
    );
  }

  return (
    <>
      <div className={`as-scrim ${open ? "is-open" : ""}`} onClick={onClose} aria-hidden="true" />
      <aside className={`as-history ${open ? "is-open" : ""}`} aria-label="Your chats">
        <div className="as-history-brand">
          <span className="as-avatar is-lg" aria-hidden="true">
            <Icon name="sparkle" size={20} />
          </span>
          <div className="as-head-text">
            <strong>Annapurna Assist</strong>
            <span className="as-head-sub">
              Your business helper
            </span>
          </div>
          <button type="button" className="as-iconbtn as-history-close" onClick={onClose} aria-label="Close chats">
            <Icon name="close" size={18} />
          </button>
        </div>
        {newChat("ap-btn-block")}
        {search}
        {list}
        {/* The super admin's usage page (8.3) */}
        {canSeeUsage && (
          <Link href="/admin/assistant/usage" className="as-history-usage">
            <Icon name="chart" size={15} /> Usage and cost
          </Link>
        )}
      </aside>
      {popup}
    </>
  );
}
