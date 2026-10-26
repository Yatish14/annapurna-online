import Assistant from "@/components/assistant/Assistant";
import { requireUser } from "@/lib/auth";
import { readParams, type SearchParams } from "../filters";

export const metadata = { title: "Annapurna Assist" };

export default async function AssistantPage({ searchParams }: { searchParams: SearchParams }) {
  // Every signed-in role can open it; viewers get it view only (canUse in app/admin/layout.tsx)
  await requireUser();
  // ?chat=… : the chat that was open in the side panel (the chats themselves come from the admin layout)
  const chat = (await readParams(searchParams)).get("chat") ?? undefined;
  return <Assistant variant="page" initialChatId={chat} />;
}
