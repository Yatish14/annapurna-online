# Annapurna Assist's help search (RAG, Step 6)

How the assistant answers "how do I…" questions from the help guides, and how well the search works.

## How it works

1. **The guides**: `knowledge/*.md`, ten guides written for admins (6.1). Not business data: the same text for everyone.
2. **Chunks** (`lib/assistant/kb/chunks.ts`, 6.5): each guide is split at its `##` headings. Each chunk starts with
   "Guide › Section", so a short step still says what it's about.
3. **Embeddings** (`lib/assistant/kb/embeddings.ts`, 6.2): `gemini-embedding-2`, 768 numbers per chunk.
4. **Ingest** (`npm run kb:ingest`, 6.6): chunks go into `kb_chunks` (pgvector). A fingerprint of each chunk's text
   means only new or changed sections are embedded again.
5. **Search** (`lib/assistant/kb/search.ts`, 6.7): the question is embedded as a query; `ORDER BY embedding <=> $1
   LIMIT 5` returns the closest sections. An HNSW index (6.8) keeps it fast if the guides grow.
6. **The tool** (`search_help`, 6.9): sections scoring at least 0.5 go to the model, which answers from them and
   names the guide; a sources card under the answer lists the guides (6.10).

Exact numbers never come from here: a booking's balance or a month's profit comes from the other tools (design
decision 3).

## Free-tier notes

- The free tier allows **100 embedding requests a minute, and each text in a batch counts as one**. A single batch
  of all 104 sections failed with 429, so `GeminiEmbeddings` sends 50 at a time, half a minute apart.
- An ingest of all ten guides takes about a minute and uses 104 requests; running it again with nothing changed
  costs nothing.

## Retrieval eval (6.11)

`npm run kb:eval` asks each question in `evals/retrieval.jsonl` and checks whether a section from the right guide
comes back in the top results. There are 30 questions: 20 worded unlike the headings (two in Telugu and Hindi),
and 10 "hard" ones that describe a situation instead of naming a feature ("We sold the old car, what should I do
with it here?").

- **recall@k**: how many questions had a right guide in the top k. `search_help` gives the model the top 5.
- **MRR** (mean reciprocal rank): 1 for first place, ½ for second, ⅓ for third, averaged.

Results on 18 Nov 2026 (`evals/results/retrieval-db.json`):

| Embeddings | recall@1 | recall@3 | recall@5 | MRR |
|---|---|---|---|---|
| `gemini-embedding-2` | 97% | **100%** | 100% | 0.98 |
| The test fake (shared words only) | 43% | 67% | 77% | 0.56 |

- The only miss in first place: "We sold the old car…" found "Cancelling and restoring a booking" first and
  the fleet guide's "Switching off or deleting a vehicle" second. "Sold" sounds like ending something, and the
  cancel section is about ending something too.
- The Telugu and Hindi questions found the right English sections first: the model is multilingual, so
  `search_help` doesn't need the question translated.
- The fake row is the point of comparison: it matches words only, like a plain keyword search. Without shared
  words ("diesel" vs "fuel", "installment" vs "EMI") it misses, and that gap is what embeddings add.

## Two chunk sizes (6.12)

`npm run kb:eval -- --chars N` splits the guides again with sections of at most N characters (longer ones split at
their paragraphs) and searches in memory, with the embeddings cached in `.data/kb-eval-cache.json`.

| Chunks | Sections | Average size | Top 5 sent to the model | recall@1 | recall@3 | MRR |
|---|---|---|---|---|---|---|
| **Whole sections (up to 2,000 characters)** | 104 | 507 characters | ≈ 630 tokens | 97% | 100% | **0.983** |
| Pieces of up to 300 characters | 174 | 331 characters | ≈ 410 tokens | 97% | 100% | 0.978 |

**Kept: whole sections.** Retrieval is the same (the same one question misses first place; it drops to third with
small pieces), but a whole section gives the model a complete set of steps, while a 300-character piece can end
halfway through a list ("4. Optionally enter Litres…" without steps 5 and 6). Small pieces also need 70% more
embeddings. The guides were written with short, self-contained sections, which is why splitting further adds
nothing: the headings already do the chunking. With long, unstructured documents the answer could be different.
