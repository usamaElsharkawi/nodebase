import { requireAuth } from "@/lib/auth-utils";
import { LogoutButton } from "./logout";
import TextAiTest from "./text-ai-test";

export default async function Home() {
  await requireAuth();
  return (
    <div>
      protected server page <br />
      <TextAiTest />
      <LogoutButton />
    </div>
  );
} 
