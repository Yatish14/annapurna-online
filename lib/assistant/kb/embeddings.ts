import { Embeddings } from "@langchain/core/embeddings";

/**
 * Embeddings for the help guides (Step 6, RAG). An embedding turns a piece of text into a list of numbers (a
 * vector): texts that mean similar things get vectors that point in similar directions, even with no words in
 * common ("How do I add diesel?" and "Recording a fuel entry"). That's what lets us find the right guide for a
 * question: embed the question, then find the guide sections whose vectors are closest (lib/assistant/kb/search.ts).
 *
 * Server and scripts only (it reads GOOGLE_API_KEY). No "@/" imports here: scripts/kb-*.ts load this file with
 * plain Node too.
 */

/** Google's embedding model (free tier, same key as the chat). Checked in the model list on 18 Nov 2026. */
export const EMBEDDING_MODEL = "gemini-embedding-2";

/**
 * How many numbers per vector. The model can give up to 3,072; it's trained so the first 768 already carry most
 * of the meaning ("Matryoshka" embeddings), and 768 numbers take a quarter of the space and search faster.
 * The kb_chunks table's vector(768) column must match.
 */
export const DIMENSIONS = 768;

/**
 * Texts per batch request, and the wait between batches. Google takes up to 100 texts in one request, but the free
 * tier counts **each text** as one of its 100 embedding requests a minute (found 18 Nov 2026: one batch of the
 * guides' 104 sections failed with 429). So: 50 at a time, half a minute apart, which stays under 100 a minute.
 */
const BATCH = 50;
const BATCH_PAUSE_MS = 31_000;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * What the text is for. The model embeds a question a little differently from the text that answers it, which
 * makes questions land closer to their answers. Guides are embedded as documents, questions as queries.
 */
type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY";

/**
 * Gemini's embedding model as a LangChain Embeddings class: two methods, embedDocuments (many texts, for
 * ingesting the guides) and embedQuery (one question). @langchain/google has no embeddings class yet, so this
 * calls Google's REST API directly; anything that takes a LangChain Embeddings (vector stores, retrievers) can use it.
 */
export class GeminiEmbeddings extends Embeddings {
  private taskType: TaskType | undefined;

  constructor(options: { taskType?: TaskType } = {}) {
    super({ maxRetries: 2 }); // LangChain's caller retries a failed request twice, waiting a little longer each time
    this.taskType = options.taskType;
  }

  /** Many texts at once, in batches of 50: one request per batch, paced for the free tier's limit (BATCH above) */
  async embedDocuments(texts: string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      if (i > 0) await wait(BATCH_PAUSE_MS);
      vectors.push(...(await this.caller.call(() => this.batch(texts.slice(i, i + BATCH), this.taskType ?? "RETRIEVAL_DOCUMENT"))));
    }
    return vectors;
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.caller.call(() => this.batch([text], this.taskType ?? "RETRIEVAL_QUERY"));
    return vector;
  }

  /** One request to Google's batchEmbedContents: up to 100 texts in, one vector per text out, in the same order */
  private async batch(texts: string[], taskType: TaskType): Promise<number[][]> {
    const key = process.env.GOOGLE_API_KEY;
    if (!key) throw new Error("GOOGLE_API_KEY is missing from .env.local");
    const model = `models/${EMBEDDING_MODEL}`;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:batchEmbedContents`, {
      method: "POST",
      // The key goes in a header, not the address: addresses end up in logs
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        requests: texts.map((text) => ({ model, content: { parts: [{ text }] }, taskType, outputDimensionality: DIMENSIONS })),
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      embeddings?: { values: number[] }[];
      error?: { message?: string };
    } | null;
    if (!response.ok || !body?.embeddings) {
      // Shaped like @langchain/google's errors (a status code), so a 429 reads the same everywhere
      throw Object.assign(new Error(`Embedding failed (${response.status}): ${body?.error?.message ?? "no details"}`), {
        status: response.status,
      });
    }
    return body.embeddings.map((e) => e.values);
  }
}

/**
 * How alike two vectors are, from -1 to 1: the cosine of the angle between them. 1 = the same direction (the same
 * meaning), 0 = unrelated, below 0 = opposite (rare for text). It's the dot product (multiply number by number and
 * add up) divided by both lengths; Gemini's vectors already have length 1, so for them it's just the dot product.
 * pgvector's `<=>` operator is 1 minus this: the cosine *distance*, where smaller means closer.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let lengthA = 0;
  let lengthB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    lengthA += a[i] * a[i];
    lengthB += b[i] * b[i];
  }
  return dot / (Math.sqrt(lengthA) * Math.sqrt(lengthB) || 1);
}

// ---------- The fake, for tests (ASSISTANT_FAKE=1) ----------

/** Words too common to say what a text is about */
const STOP_WORDS = new Set(
  "a an and are as at be by can do does for from has have how i in is it its my of on or the this to was what when where which who why will with you your".split(" "),
);

/** A word's bucket in the vector (FNV-1a, a quick hash: the same word always gets the same bucket) */
function bucket(word: string): number {
  let h = 0x811c9dc5;
  for (const ch of word) h = Math.imul(h ^ ch.codePointAt(0)!, 0x01000193);
  return (h >>> 0) % DIMENSIONS;
}

/**
 * A pretend embedding that needs no Google: each word (lower case, a plural "s" dropped, common words skipped) adds
 * 1 to its own bucket, and the vector is scaled to length 1 like Gemini's. So two texts are "close" when they share
 * words: keyword matching dressed as a vector. Good enough to test the search and the tool; it knows nothing about
 * meaning ("diesel" and "fuel" share nothing), which is exactly what the real model adds.
 */
export function fakeEmbedding(text: string): number[] {
  const vector = new Array<number>(DIMENSIONS).fill(0);
  for (const raw of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (STOP_WORDS.has(raw)) continue;
    const word = raw.length > 3 && raw.endsWith("s") ? raw.slice(0, -1) : raw;
    vector[bucket(word)] += 1;
  }
  const length = Math.hypot(...vector) || 1;
  return vector.map((v) => v / length);
}

export class FakeEmbeddings extends Embeddings {
  constructor() {
    super({});
  }
  async embedDocuments(texts: string[]) {
    return texts.map(fakeEmbedding);
  }
  async embedQuery(text: string) {
    return fakeEmbedding(text);
  }
}

/** The embeddings the app and scripts use: the fake with ASSISTANT_FAKE=1 (tests), Gemini otherwise */
export function embeddings(): Embeddings {
  return process.env.ASSISTANT_FAKE === "1" ? new FakeEmbeddings() : new GeminiEmbeddings();
}
