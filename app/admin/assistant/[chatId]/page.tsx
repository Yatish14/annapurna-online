import { notFound } from "next/navigation";
import Assistant from "@/components/assistant/Assistant";
import { chatSummary } from "@/lib/assistant/chatStore";
import { openChat } from "@/lib/assistant/openChat";
import { requireUser } from "@/lib/auth";

type Params = Promise<{ chatId: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const user = await requireUser();
  const chat = await chatSummary((await params).chatId, user.id);
  return { title: chat ? `${chat.title} · Annapurna Assist` : "Annapurna Assist" };
}

/**
 * One saved chat (5.3), at the address the chat gets with its first question: a reload or a bookmark opens it
 * again. Only the admin who had the chat can open it; for anyone else it doesn't exist.
 */
export default async function ChatPage({ params }: { params: Params }) {
  const user = await requireUser();
  const chat = await openChat((await params).chatId, user.id);
  if (!chat) notFound();
  // key: another chat's address is a fresh view (its own scroll position and state)
  return <Assistant key={chat.id} variant="page" initialChat={chat} />;
}
