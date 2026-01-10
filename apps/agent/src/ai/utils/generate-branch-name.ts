import { generateObject, type ModelMessage } from "ai";
import { z } from "zod";

import { Logger } from "@weldr/shared/logger";

import { registry } from "./registry";

const branchNameSchema = z.object({
  branchName: z
    .string()
    .describe("A concise, kebab-case branch name (e.g., 'add-user-auth', 'fix-login-bug')"),
});

export async function generateBranchName(messages: ModelMessage[]) {
  const { object } = await generateObject({
    system: `You are a helpful assistant that generates concise, professional branch names.

    Guidelines:
    - Branch names should be in kebab-case (lowercase with hyphens)
    - Branch names should be 2-5 words max
    - Should accurately reflect the conversation and changes discussed
    `,
    model: registry.languageModel("google:gemini-2.5-flash"),
    messages: [
      ...messages,
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Based on the conversation history, generate a branch name that summarizes the changes.",
          },
        ],
      },
    ],
    schema: branchNameSchema,
    maxOutputTokens: 256,
  });

  Logger.info("Generated branch name", {
    branchName: object.branchName,
  });

  return object.branchName;
}
