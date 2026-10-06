import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";

export const appRouter = createTRPCRouter({
  textAi: protectedProcedure.mutation(async () => {
    const { text } = await generateText({
      model: google("gemini-3.5-flash"),
      prompt: "Write a vegetarian lasagna recipe for 4 people.",
      maxRetries: 0,
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
