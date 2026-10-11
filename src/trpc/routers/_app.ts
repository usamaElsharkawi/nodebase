import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import * as Sentry from "@sentry/nextjs";

export const appRouter = createTRPCRouter({
  textAi: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      Sentry.setTag("conversation_id", input.conversationId);

      const { text } = await generateText({
        model: google("gemini-3.5-flash"),
        prompt: "Write a vegetarian lasagna recipe for 4 people.",
        maxRetries: 0,
        experimental_telemetry: {
          isEnabled: true,
          functionId: "text-ai-recipe",
        },
      });

      return { text };
    }),
  hello: protectedProcedure
    .input(
      z.object({
        text: z.string(),
      }),
    )
    .query((opts) => {
      return {
        greeting: `hello ${opts.input.text}`,
      };
    }),
});
// export type definition of API
export type AppRouter = typeof appRouter;