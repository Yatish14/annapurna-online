import Assistant from "@/components/assistant/Assistant";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Annapurna Assist" };

/** The full Assistant page with a new chat. A saved chat has its own address: /admin/assistant/<id> ([chatId]/page.tsx). */
export default async function AssistantPage() {
  // Every signed-in role can open it; viewers get it view only (canUse in app/admin/layout.tsx)
  await requireUser();
  return <Assistant variant="page" />;
}
