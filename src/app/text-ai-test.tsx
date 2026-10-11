"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

export default function TextAiTest() {
  const trpc = useTRPC();
  const conversationId = useRef<string | null>(null);
  const testAI = useMutation(trpc.textAi.mutationOptions({
    onError:()=>{
      toast.error("Something went wong")
    }
  }));

  return (
    <div>
      <Button
        onClick={() => {
          conversationId.current ??= crypto.randomUUID();
          testAI.mutate({ conversationId: conversationId.current });
        }}
        disabled={testAI.isPending}
      >
        {testAI.isPending ? "generating..." : "test ai"}
      </Button>
      {testAI.data && <p>{testAI.data.text}</p>}

    </div>
  );
}
