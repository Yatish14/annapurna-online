import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { query } from "@/lib/db";
import { embeddings } from "../kb/embeddings";
import { searchGuides } from "../kb/search";
import { toolReply } from "./result";

/**
 * search_help (6.9): the RAG tool. Finds the help guides' sections (knowledge/*.md, put in kb_chunks by
 * `npm run kb:ingest`) closest in meaning to the admin's question, and gives the model their text to answer from.
 *
 * Help, not facts: the guides say how the dashboard works and what words mean. A booking's balance or this month's
 * profit always comes from the other tools, never from here (design decision 3): a guide can't be out of date
 * about a number it never had.
 *
 * Not business data either: the same text for everyone, written by the business. So in privacy-first mode (Step 9)
 * the model can still read it.
 */

/**
 * Sections less alike than this are left out, so a question no guide covers gets "none" instead of five unrelated
 * sections. Gemini's scores for unrelated text in the same language sit around 0.45 (scripts/kb-compare.ts).
 * The fake's come from shared words, plus a little noise where two words land in the same bucket (up to about 0.12
 * for words no guide has; real questions score 0.3 and up).
 */
const MIN_SCORE = process.env.ASSISTANT_FAKE === "1" ? 0.2 : 0.5;

export const searchHelp = tool(
  async ({ question }) => {
    const hits = (await searchGuides(query, embeddings(), question)).filter((h) => h.score >= MIN_SCORE);
    if (!hits.length) {
      return toolReply(
        { status: "none", data: { sections: [] }, note: "No help guide covers this." },
        { ownText: true },
      );
    }
    return toolReply(
      {
        status: "found",
        data: {
          // Closest first. The model reads the text; the guide and section say where it's from (6.10)
          sections: hits.map((h) => ({ guide: h.guide, section: h.section, score: Number(h.score.toFixed(2)), text: h.text })),
        },
      },
      { ownText: true },
    );
  },
  {
    name: "search_help",
    description:
      "Searches the dashboard's help guides and gives you the closest sections to answer from. Use it for: how to do " +
      "something in the dashboard (add or edit a booking, record a payment or fuel, handle printouts, add a user, use " +
      "this assistant), what a word means (advance, balance, driver amount, booking statuses), and the business's " +
      "own details (phone, cars and seats, booking rules). Not for the business's records or numbers (bookings, " +
      "money, counts): use the other tools for those.",
    schema: z.object({
      question: z
        .string()
        .min(2)
        .max(300)
        // Any language: gemini-embedding-2 is multilingual (18 Nov 2026: a Telugu question found the English
        // "Adding a user" section first, scoring 0.74)
        .describe("What to look up, as a short question in the admin's words (English, Telugu or Hindi)."),
    }),
    responseFormat: "content_and_artifact",
  },
);
