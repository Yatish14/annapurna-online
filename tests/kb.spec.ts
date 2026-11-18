import "./unitDb"; // first: the no-browser tests' throwaway database and the fake models
import { expect, test } from "@playwright/test";
import { chunkHash, splitGuide } from "@/lib/assistant/kb/chunks";
import { cosineSimilarity, fakeEmbedding } from "@/lib/assistant/kb/embeddings";

/** Step 6: the help guides, split, embedded (fake embeddings: no Google) and searched in PGlite with pgvector */

const FUEL = `# Fuel guide
How fuel is recorded.

## Recording a fuel entry
Open the booking and press Add fuel. Type the amount and the litres.

## Fuel price warnings
A price per litre far from normal shows a warning before saving.
`;
const PRINT = `# Printouts guide

## Customer uploads
Customers scan the QR code at the counter and upload their files.
`;

test("a guide is split at its ## headings, each chunk carrying its guide's and section's titles", () => {
  const chunks = splitGuide("fuel.md", FUEL);
  expect(chunks.map((c) => c.section)).toEqual(["Overview", "Recording a fuel entry", "Fuel price warnings"]);
  expect(chunks[1].text).toBe("Fuel guide › Recording a fuel entry\n\nOpen the booking and press Add fuel. Type the amount and the litres.");
  expect(chunks.map((c) => c.position)).toEqual([0, 1, 2]);
  // Same text, same fingerprint; any change, a new one
  expect(chunks[1].hash).toBe(chunkHash(chunks[1].text));
  expect(splitGuide("fuel.md", FUEL.replace("litres", "liters"))[1].hash).not.toBe(chunks[1].hash);
  // No text before the first ## → no Overview chunk
  expect(splitGuide("print.md", PRINT).map((c) => c.section)).toEqual(["Customer uploads"]);
});

test("a section longer than the limit is split at its paragraphs, each part keeping the titles", () => {
  const long = `# Long\n\n## Steps\n${["First paragraph.", "Second paragraph.", "Third paragraph."].join("\n\n")}`;
  const chunks = splitGuide("long.md", long, 20);
  expect(chunks.map((c) => c.section)).toEqual(["Steps (part 1)", "Steps (part 2)", "Steps (part 3)"]);
  expect(chunks[2].text).toBe("Long › Steps (part 3)\n\nThird paragraph.");
});

test("the fake embedding: length 1, and texts sharing words are closer", () => {
  const v = fakeEmbedding("Recording a fuel entry");
  expect(v).toHaveLength(768);
  expect(Math.hypot(...v)).toBeCloseTo(1, 6);
  const fuel = fakeEmbedding("fuel entry for a booking");
  expect(cosineSimilarity(v, fuel)).toBeGreaterThan(cosineSimilarity(v, fakeEmbedding("customer uploads at the counter")));
});
