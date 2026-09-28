import { requireAuth } from "@/lib/auth-utils";
import { LogoutButton } from "./logout";
import { caller } from "@/trpc/server";

export default async function Home() {
  await requireAuth();
  const greating = await caller.hello({ text: "usama" });
  return (
    <div>
      protected server page <br />
      {greating.greeting}
      <LogoutButton />
    </div>
  );
}
