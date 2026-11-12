import { listBookings } from "./bookings";
import { getToday } from "./today";

/** Every tool Annapurna Assist can use. The graph (lib/assistant/graph.ts) gives this list to the model. */
export const TOOLS = [getToday, listBookings];
