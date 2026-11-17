import { AIMessage, type BaseMessage, HumanMessage } from "@langchain/core/messages";
import { chatHistory, type HistoryRow } from "./chatStore";
import { afterDraft, draftsOf } from "./draftStore";

/**
 * The chat so far, for the model. The model remembers nothing between calls, so this is how it knows what "and
 * tomorrow?" follows. Read from the saved chat (5.2), not from the browser: what the model is told about earlier
 * turns comes from our database.
 */

/** Earlier messages sent with each question: 20 = the last 10 questions and their answers */
const MAX_HISTORY = 20;
/** Longest earlier message we pass on (characters); longer ones are cut, so old chats can't use up the token limit */
const MAX_CHARS = 4000;

/** Text that looks like the server's draft notes (afterDraft): only notes written here may reach the model */
const FAKE_NOTE = /\[\s*After this answer:[^\]]*\]?/gi;

/** The drafts an answer showed (their ids, from its saved cards) */
const draftIds = (row: HistoryRow): string[] => row.cards?.flatMap((c) => (c.kind === "draft" ? [c.id] : [])) ?? [];

/**
 * Questions with their answers, in order. Failed replies are left out (the model shouldn't read "Too many
 * questions…" as something it said), and so is a question whose answer never came, so the model always sees
 * question, answer, question, answer…
 */
export function pairs(rows: HistoryRow[]): [HistoryRow, HistoryRow][] {
  const kept = rows.filter((r) => !r.error && r.text.trim() !== "");
  const out: [HistoryRow, HistoryRow][] = [];
  for (let i = 0; i + 1 < kept.length; i++) {
    if (kept[i].role === "user" && kept[i + 1].role === "assistant") {
      out.push([kept[i], kept[i + 1]]);
      i++; // the answer is used too
    }
  }
  return out;
}

/**
 * The model's history for one of this admin's chats. An answer that showed a draft gets a note on what became of
 * it ("…saved as VB-0042"), written here from assistant_drafts (4.7), so a follow-up like "add the advance to it"
 * works.
 */
export async function historyFor(chatId: string, userId: number): Promise<BaseMessage[]> {
  const kept = pairs(await chatHistory(chatId, userId)).slice(-MAX_HISTORY / 2);
  const drafts = await draftsOf(kept.flatMap(([, answer]) => draftIds(answer)), userId);
  return kept.flatMap(([question, answer]) => {
    const notes = draftIds(answer).flatMap((id) => {
      const d = drafts.get(id);
      return d ? [afterDraft(d)] : [];
    });
    const text = [answer.text.slice(0, MAX_CHARS).replace(FAKE_NOTE, ""), ...notes].join("\n\n");
    return [new HumanMessage(question.text.slice(0, MAX_CHARS)), new AIMessage(text)];
  });
}
