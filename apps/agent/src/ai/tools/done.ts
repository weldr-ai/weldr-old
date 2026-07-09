import { z } from "zod";

import { Logger } from "@weldr/shared/logger";

import { createTool } from "../utils/create-tool";

export const doneTool = createTool({
  name: "done",
  description: `Call this tool when you have completed the user's request and there is nothing more to do.

Use this tool to signal that:
- You have finished implementing the requested feature or fix
- You have answered the user's question
- You are waiting for additional input or clarification from the user

Do NOT call this tool if:
- There are still pending tasks to complete
- You need to run more tools to finish the work
- An error occurred that needs to be fixed`,
  inputSchema: z.object({
    summary: z.string().describe("A brief summary of what was accomplished"),
  }),
  outputSchema: z.object({
    status: z.literal("completed"),
  }),
  execute: async ({ input, context }) => {
    const logger = Logger.get({
      projectId: context.project.id,
      snapshotId: context.branch.snapshot?.id,
    });

    logger.info("Agent signaled completion", {
      extra: { summary: input.summary },
    });

    return { status: "completed" as const };
  },
});
