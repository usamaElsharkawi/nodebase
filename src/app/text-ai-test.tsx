"use client";

import { Button } from "@/components/ui/button";
import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";

export default function TextAiTest() {
  const trpc = useTRPC();
  const testAI = useMutation(trpc.textAi.mutationOptions());

  return (
    <div>
      <Button onClick={() => testAI.mutate()} disabled={testAI.isPending}>
        {testAI.isPending ? "generating..." : "test ai"}
      </Button>
      {testAI.data && <p>{testAI.data.text}</p>}
      {testAI.error && <p role="alert">{testAI.error.message}</p>}
    </div>
  );
}
