import Assistant from "@/components/assistant/Assistant";
import { requireUser } from "@/lib/auth";
import { readParams, type SearchParams } from "../filters";

export const metadata = { title: "Annapurna Assist" };

export default async function AssistantPage({ searchParams }: { searchParams: SearchParams }) {
  // Viewers are sent away on the server, before anything is rendered
  await requireUser("useAssistant");
  // ?chat=… : the chat that was open in the side panel (the chats themselves come from the admin layout)
  const chat = (await readParams(searchParams)).get("chat") ?? undefined;
  return <Assistant variant="page" initialChatId={chat} />;
}
