import { chatMessages, chatSummary } from "./chatStore";
import { cardState } from "./confirm";
import { draftsOf } from "./draftStore";
import type { Chat } from "./types";

/**
 * One of this admin's saved chats, ready to show (5.3): its messages as they were, except draft cards, whose status
 * comes from assistant_drafts now. A card confirmed, cancelled or expired since then shows that, with the same words
 * as the card itself ("Saved as VB-0042."). Null if the chat isn't this admin's. Server only.
 */
export async function openChat(chatId: string, userId: number): Promise<Chat | null> {
  const [summary, messages] = await Promise.all([chatSummary(chatId, userId), chatMessages(chatId, userId)]);
  if (!summary || !messages) return null;
  const ids = messages.flatMap((m) => m.cards?.flatMap((c) => (c.kind === "draft" ? [c.id] : [])) ?? []);
  const drafts = await draftsOf(ids, userId);
  return {
    id: summary.id,
    title: summary.title,
    when: summary.when,
    messages: messages.map((m) =>
      m.cards
        ? {
            ...m,
            cards: m.cards.map((card) => {
              const draft = card.kind === "draft" ? drafts.get(card.id) : undefined;
              const state = draft && cardState(draft);
              return card.kind === "draft" && state ? { ...card, ...state } : card;
            }),
          }
        : m,
    ),
  };
}
