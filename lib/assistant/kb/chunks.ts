import { createHash } from "node:crypto";
import { DIMENSIONS, EMBEDDING_MODEL } from "./embeddings";

/**
 * Splitting the help guides (knowledge/*.md) into chunks: the pieces that are embedded and searched (Step 6).
 *
 * Chunking trade-offs (6.5):
 * - One vector per chunk, so a chunk should be about one thing. A whole guide in one vector is a blur of every topic
 *   in it, and a question about one of them matches it only weakly.
 * - But a chunk must also make sense on its own: the model reads only the chunks we find, not the rest of the guide.
 *   A single sentence ("Then press Save.") has no idea what it's about.
 * - Headings are where the writer already split the topics, so we split there: one chunk per "## " section, each
 *   starting with its guide's and section's titles (so "Then press Save." travels with "Fuel → Recording a fuel
 *   entry"). A section longer than `maxChars` is split again at its paragraphs, each piece keeping the titles.
 * - Smaller chunks find more precise matches but carry less context; bigger ones the opposite. 6.12 measures both.
 *
 * No "@/" imports: scripts/kb-ingest.ts uses this with plain Node too.
 */

export type Chunk = {
  /** The file, e.g. "fuel-and-expenses.md" */
  source: string;
  /** The guide's title: its "# " heading */
  guide: string;
  /** The section's "## " heading ("Overview" for the text before the first one); "(part 2)" when split again */
  section: string;
  /** Where it is in the file: 0, 1, 2… */
  position: number;
  /** What's embedded and what the model reads: "Guide › Section", then the section's text */
  text: string;
  /** A fingerprint of the text and the embedding settings (6.6: an unchanged chunk isn't embedded again) */
  hash: string;
};

/** Sections up to this long stay whole. About 300 words: most guide sections fit, so most chunks are one section. */
export const MAX_CHARS = 2000;

/**
 * The fingerprint: SHA-256 of the embedding model, its size and the text. Change any of them (a guide edited, a new
 * model) and the hash changes, so the chunk is embedded again; otherwise the stored vector is still right.
 */
export function chunkHash(text: string): string {
  return createHash("sha256").update(`${EMBEDDING_MODEL}:${DIMENSIONS}\n${text}`).digest("hex");
}

/** Paragraphs (split at blank lines), packed into pieces of at most `maxChars` (a longer paragraph stays whole) */
function pieces(body: string, maxChars: number): string[] {
  if (body.length <= maxChars) return [body];
  const out: string[] = [];
  let current = "";
  for (const paragraph of body.split(/\n\s*\n/)) {
    if (current && current.length + paragraph.length + 2 > maxChars) {
      out.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current) out.push(current);
  return out;
}

/**
 * One guide's chunks. Expects Markdown with one "# Title" line, then "## Section" headings ("### " ones stay inside
 * their section). Empty sections are skipped.
 */
export function splitGuide(source: string, markdown: string, maxChars = MAX_CHARS): Chunk[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const guide = lines.find((l) => l.startsWith("# "))?.slice(2).trim() || source.replace(/\.md$/, "");
  // Sections: the heading and the lines under it, up to the next "## "
  const sections: { title: string; lines: string[] }[] = [{ title: "Overview", lines: [] }];
  for (const line of lines) {
    if (line.startsWith("# ")) continue;
    if (line.startsWith("## ")) sections.push({ title: line.slice(3).trim(), lines: [] });
    else sections.at(-1)!.lines.push(line);
  }
  const chunks: Chunk[] = [];
  for (const { title, lines: body } of sections) {
    const text = body.join("\n").trim();
    if (!text) continue;
    const parts = pieces(text, maxChars);
    parts.forEach((part, i) => {
      const section = parts.length > 1 ? `${title} (part ${i + 1})` : title;
      // The titles go in the embedded text too: they say what the section is about in the fewest words
      const full = `${guide} › ${section}\n\n${part}`;
      chunks.push({ source, guide, section, position: chunks.length, text: full, hash: chunkHash(full) });
    });
  }
  return chunks;
}

/** Every guide's chunks, each identical chunk once (the hash is unique in kb_chunks) */
export function splitGuides(files: { source: string; markdown: string }[], maxChars = MAX_CHARS): Chunk[] {
  const seen = new Set<string>();
  return files
    .flatMap((f) => splitGuide(f.source, f.markdown, maxChars))
    .filter((c) => !seen.has(c.hash) && Boolean(seen.add(c.hash)));
}
