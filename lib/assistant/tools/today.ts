import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { addDays, fmtShort, nowLocalIST, todayIST } from "@/lib/dates";
import { toolReply } from "./result";

/**
 * get_today: today's date and time in India, or the date some days away. The model is bad at date
 * arithmetic ("what's the date 10 days from now?"), so it asks; our code counts.
 *
 * A tool has three parts:
 * - name and description: all the model knows about the tool. It decides when to use it from the description alone.
 * - schema (zod): the inputs. LangChain turns it into a description of the inputs for the model, and checks
 *   what the model actually sends before the function runs (a wrong type never reaches our code).
 * - the function: plain TypeScript. Only our server runs it; the model only asks for it to be run.
 */
export const getToday = tool(
  async ({ plus_days }) => {
    const today = todayIST();
    const date = addDays(today, plus_days);
    return toolReply({
      status: "found",
      data: {
        date, // "2026-11-13"
        day: `${fmtShort(date)} ${date.slice(0, 4)}`, // "Fri, 13 Nov 2026"
        today,
        time_now: nowLocalIST().slice(11), // "15:20", 24-hour, India time
      },
    });
  },
  {
    name: "get_today",
    description:
      "Gets today's date and the time now in India (IST). With plus_days, gets the date that many days from today " +
      "(1 = tomorrow, -1 = yesterday, 7 = one week from today). Use it whenever you need a date you'd otherwise have to count.",
    schema: z.object({
      plus_days: z
        .number()
        .int()
        .min(-366)
        .max(366)
        .default(0)
        .describe("Days from today: 0 for today, 1 for tomorrow, -1 for yesterday."),
    }),
    responseFormat: "content_and_artifact",
  },
);
