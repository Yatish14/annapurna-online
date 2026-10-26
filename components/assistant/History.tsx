"use client";

import { useState } from "react";
import Icon from "@/components/admin/Icon";
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
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
};

/** Your earlier chats, newest first, grouped by day, with a search box */
export default function History({ chats, activeId, inline, open, onClose, onSelect, onNew, onDelete }: Props) {
  const [query, setQuery] = useState("");
  const { canUse, notify } = useAssist();
  /** Viewers: greyed out, but the click still says why */
  const locked = canUse ? {} : { "aria-disabled": true as const };

  const q = query.trim().toLowerCase();
  const saved = chats.filter((c) => c.messages.length > 0);
  const shown = q
    ? saved.filter((c) => c.title.toLowerCase().includes(q) || c.messages.some((m) => m.text.toLowerCase().includes(q)))
    : saved;

  // "Today" → [chats], "Yesterday" → [chats] … in the order they first appear
  const groups = new Map<string, Chat[]>();
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
                <button type="button" className="as-history-item" onClick={() => onSelect(c.id)}>
                  {c.title}
                </button>
                <button
                  type="button"
                  className="as-history-delete"
                  aria-label={`Delete “${c.title}”`}
                  title="Delete chat"
                  {...locked}
                  onClick={() => {
                    // Viewers get the message straight away, not a "Delete?" question first
                    if (!canUse) return notify(VIEW_ONLY.deleteChat);
                    if (confirm(`Delete “${c.title}”?`)) onDelete(c.id);
                  }}
                >
                  <Icon name="trash" size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
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
              <span className="ap-badge is-sample">Sample</span>
            </span>
          </div>
          <button type="button" className="as-iconbtn as-history-close" onClick={onClose} aria-label="Close chats">
            <Icon name="close" size={18} />
          </button>
        </div>
        {newChat("ap-btn-block")}
        {search}
        {list}
      </aside>
    </>
  );
}
