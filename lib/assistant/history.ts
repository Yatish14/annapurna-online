import { AIMessage, type BaseMessage, HumanMessage } from "@langchain/core/messages";
import { chatHistory, type HistoryRow } from "./chatStore";
import { afterDraft, draftsOf } from "./draftStore";

/**
 * The chat so far, for the model. The model remembers nothing between calls, so this is how it knows what "and
 * tomorrow?" follows. Read from the saved chat (5.2), not from the browser: what the model is told about earlier
 * turns comes from our database.
 *
 * Trimmed to a token budget (5.7). The model reads its whole input on every call, so each earlier message is sent
 * and read again with every question: a long chat gets slower, uses up the free tier's tokens a minute, and on a paid
 * model costs more per question, while its oldest turns rarely matter. So only the newest turns that fit the budget go.
 */

/** Tokens for the earlier turns of a chat (about 24,000 English letters). The rules and the new question come on top. */
export const HISTORY_TOKENS = 6000;
/** Longest earlier message we pass on (characters); longer ones are cut, so one huge answer can't fill the budget */
const MAX_CHARS = 4000;

/**
 * Roughly how many tokens a text is. Models read tokens (pieces of words), not letters: about 4 English letters
 * each. UTF-8 bytes / 4 gives that for English, and counts a Telugu or Hindi letter (3 bytes) as ¾ of a token,
 * on the safe side: those scripts take more tokens per letter. An estimate, to stay under a budget; Step 8 reads
 * the real counts Gemini sends back.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(new TextEncoder().encode(text).length / 4);
}

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
 * The newest turns that fit the budget, oldest first, always in whole pairs (a question without its answer, or an
 * answer without its question, would confuse the model). The newest pair is kept even if it's bigger than the
 * budget on its own. `left` is how many older turns didn't fit.
 */
export function fitToBudget<T>(turns: T[], tokens: (turn: T) => number, budget = HISTORY_TOKENS): { kept: T[]; left: number } {
  let used = 0;
  let start = turns.length;
  while (start > 0) {
    const next = tokens(turns[start - 1]);
    if (start < turns.length && used + next > budget) break;
    used += next;
    start--;
  }
  return { kept: turns.slice(start), left: start };
}

export type History = {
  messages: BaseMessage[];
  /** How many older questions and answers were left out to stay within the budget (the model is told, 5.7) */
  left: number;
};

/**
 * The model's history for one of this admin's chats. An answer that showed a draft gets a note on what became of
 * it ("…saved as VB-0042"), written here from assistant_drafts (4.7), so a follow-up like "add the advance to it"
 * works. Counted as sent: the cut texts and the notes.
 */
export async function historyFor(chatId: string, userId: number): Promise<History> {
  const all = pairs(await chatHistory(chatId, userId));
  const drafts = await draftsOf(all.slice(-20).flatMap(([, answer]) => draftIds(answer)), userId);
  const turns = all.map(([question, answer]) => {
    const notes = draftIds(answer).flatMap((id) => {
      const d = drafts.get(id);
      return d ? [afterDraft(d)] : [];
    });
    return {
      question: question.text.slice(0, MAX_CHARS),
      answer: [answer.text.slice(0, MAX_CHARS).replace(FAKE_NOTE, ""), ...notes].join("\n\n"),
    };
  });
  const { kept, left } = fitToBudget(turns, (t) => estimateTokens(t.question) + estimateTokens(t.answer));
  return { messages: kept.flatMap((t) => [new HumanMessage(t.question), new AIMessage(t.answer)]), left };
}
