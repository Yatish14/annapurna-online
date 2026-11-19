/**
 * Small things the chat shows that both the browser and the server use (no server-only code here).
 */

/** Questions shown on an empty chat, one tap to ask */
export const SUGGESTIONS = [
  { icon: "bookings", text: "Which bookings are on the road this week?" },
  { icon: "rupee", text: "Who owes us money?" },
  { icon: "chart", text: "Give me last month's report" },
  { icon: "plus", text: "Book the Innova for Ravi Kumar, Vijayawada to Tirupati, a week from today, 3 days" },
] as const;

/** A chat's first title: its first question, cut short (Flash-Lite writes a better one, 5.5) */
export const titleFrom = (question: string) => {
  const q = question.replace(/\s+/g, " ").trim();
  return q.length > 48 ? `${q.slice(0, 45).trimEnd()}…` : q;
};
