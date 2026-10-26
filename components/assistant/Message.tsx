"use client";

import { useState } from "react";
import Icon from "@/components/admin/Icon";
import type { Card, Message, ToolStep } from "@/lib/assistant/types";
import CardView from "./Cards";

type DraftCard = Extract<Card, { kind: "draft" }>;

/** "**bold**" → <strong>bold</strong> */
function inline(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
}

/** Paragraphs, "- " bullet lists and "1. " numbered steps */
function RichText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const list = /^- /.test(lines[i]) ? "ul" : /^\d+\. /.test(lines[i]) ? "ol" : null;
    if (!list) {
      if (lines[i].trim()) blocks.push(<p key={i}>{inline(lines[i])}</p>);
      continue;
    }
    // Collect the following lines of the same list
    const items: string[] = [];
    const pattern = list === "ul" ? /^- / : /^\d+\. /;
    while (i < lines.length && pattern.test(lines[i])) items.push(lines[i++].replace(pattern, ""));
    i--;
    const List = list;
    blocks.push(
      <List key={i}>
        {items.map((item, n) => (
          <li key={n}>{inline(item)}</li>
        ))}
      </List>,
    );
  }
  return <div className="as-text">{blocks}</div>;
}

type Props = {
  message: Message;
  /** This reply is being written right now */
  live?: boolean;
  /** The tool running right now (only while live) */
  running?: ToolStep | null;
  onConfirm: (card: DraftCard) => void;
  onCancel: (card: DraftCard) => void;
};

export default function MessageView({ message, live, running, onConfirm, onCancel }: Props) {
  const [copied, setCopied] = useState(false);

  if (message.role === "user") {
    return (
      <div className="as-msg is-user">
        <div className="as-bubble">{message.text}</div>
        <span className="as-meta">
          {message.voice && <Icon name="mic" size={12} />} {message.time}
        </span>
      </div>
    );
  }

  const thinking = live && !running && !message.text;

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.text.replace(/\*\*/g, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (http:// on a phone, or permission denied): nothing to do
    }
  }

  return (
    <div className="as-msg is-assistant">
      <span className="as-avatar" aria-hidden="true">
        <Icon name="sparkle" size={17} />
      </span>
      <div className="as-msg-body">
        {(message.steps?.length || running) && (
          <ul className="as-steps" aria-label="What the assistant checked">
            {message.steps?.map((s) => (
              <li key={s.label}>
                <Icon name={s.icon} size={13} /> {s.label}
                <Icon name="check" size={12} className="as-step-done" />
              </li>
            ))}
            {running && (
              <li className="is-running">
                <span className="ap-link-spinner" aria-hidden="true" /> {running.label}…
              </li>
            )}
          </ul>
        )}

        {thinking && (
          <div className="as-typing" aria-label="Thinking">
            <i />
            <i />
            <i />
          </div>
        )}
        {message.text && <RichText text={message.text} />}

        {message.cards?.map((card, i) => (
          <CardView key={i} card={card} onConfirm={onConfirm} onCancel={onCancel} />
        ))}

        {!live && (
          <span className="as-meta">
            {message.stopped && <span className="as-stopped">Stopped</span>}
            {message.time}
            {message.text && (
              <button type="button" className="as-copy" onClick={copy} aria-label="Copy reply">
                <Icon name={copied ? "check" : "file"} size={13} /> {copied ? "Copied" : "Copy"}
              </button>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
