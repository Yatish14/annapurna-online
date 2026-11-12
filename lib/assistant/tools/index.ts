import { getToday } from "./today";

/** Every tool Annapurna Assist can use. The graph (lib/assistant/graph.ts) gives this list to the model from 2.4. */
export const TOOLS = [getToday];
