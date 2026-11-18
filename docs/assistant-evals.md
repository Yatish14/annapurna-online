# Annapurna Assist's evals (Step 8)

Does the assistant pick the right tool, with the right inputs, for an admin's question? The evals ask it every
question in `evals/cases.jsonl` and grade the answers with code.

## How to run them

```bash
npm run eval:setup                     # once: a fresh eval database (.data/pglite-eval) with the sample data
npm run eval                           # every case, with Flash-Lite (uses 2–3 requests a question)
npm run eval -- --limit 20             # the first 20
npm run eval -- --tags drafts,money    # only these tags
npm run eval -- --model gemini-3.8-flash --limit 10
npm run eval -- --model replay         # free: replays the last real run's answers (CI does this, 8.12)
```

- **The eval database** (`evals/setup.ts`): PGlite in `.data/pglite-eval` with the made-up sample bookings
  (`scripts/seed-expenses.mjs`), the help guides and an "Eval Admin" for the drafts. Never Docker or Neon. The
  model sees these sample rows, which is why only sample data is used on the free tier.
- **The runner** (`evals/run.ts`, 8.5) runs the real graph with the real tools on that database, so a question that
  needs two steps (the date, then the bookings) is graded on all its tool calls. It waits as needed to stay under the
  free tier's per-minute limit (13 requests a minute for Flash-Lite, 4 for 3.8 Flash).
- **The graders** (`evals/graders.ts`, 8.6) are plain code: free, instant and always the same verdict.
- **Recordings**: every real run saves what the model said in `evals/recordings/answers.json`. `--model replay`
  plays it back with the tools still running for real: free, for CI.

## The report (8.7)

Each run prints a summary and saves `evals/results/tools-<model>.json`:

- **accuracy**: cases that passed (right tools, right inputs, nothing forbidden, the answer's must/mustn't words)
- **tools right**: cases with the right tools, inputs aside, to tell "wrong tool" from "right tool, wrong input"
- **by tag**: accuracy for bookings, money, drafts, help…
- **time**: seconds a case, from the question to the last word (the runner's pacing waits aren't counted)
- **cost**: model requests, tokens in (and how many were cached), tokens out, and what it would cost on the paid tier
  (`lib/assistant/prices.ts`)
- **failures**: each failed case with the reasons and the calls the model made
- **results**: every case's calls and the answer's words (for the AI judge, 8.9)

## Results

### First 20 cases, Flash-Lite (18 Nov 2026)

`evals/results/tools-gemini-3.5-flash-lite.json` (this run was overwritten by the 100-case run below; the numbers
are from the console):

| Cases | Passed | Right tools | Seconds a case | Requests | Tokens in (cached) | Out | Would cost |
|---|---|---|---|---|---|---|---|
| 20 | **20 (100%)** | 100% | 3.3 | 40 | 2,17,442 (26%) | 1,534 | ₹5.12 |

- Most questions took 1 or 2 model turns. The booking draft took 4: `get_today` for "tomorrow"; `draft_booking`
  without the customer's name and phone (the model left them out, and the tool said they were missing); again
  with them; then, since no driver was named, "Which driver should I assign to this booking?" (as the prompt asks:
  never pick a driver for the admin). The grader passes it because one `draft_booking` call had every expected input.
- **Where the money goes: input.** About 5,400 tokens a request, almost all of it the system prompt and the 15 tools'
  descriptions, sent again with every request. The answers are short (about 40 tokens). A quarter of the input was
  cached (8.11).
- 20 easy cases, all passing, don't say much yet: 8.8 grows the set to 100 with harder ones.
