import { z } from "zod";

import { db, eq } from "@weldr/db";
import { versions } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";
import { planSchema, taskSchema } from "@weldr/shared/validators/plans";

import { stream } from "@/lib/stream-utils";
import { createTasks } from "../utils/tasks";
import { createTool } from "./utils";

export const callCoderTool = createTool({
  name: "call_coder",
  description:
    "MANDATORY FINAL ACTION: Hands off the project to the coder agent to start development. You MUST call this tool after generating tasks - this is not optional.",
  whenToUse:
    "MANDATORY: After all setup is complete, tasks are generated, and the plan is ready. This MUST be your final action - do not finish without calling this tool. Call this immediately after task generation is complete.",
  inputSchema: planSchema.describe("The plan to be completed"),
  outputSchema: z.discriminatedUnion("success", [
    z.object({
      success: z.literal(true),
      tasks: z.array(taskSchema),
    }),
  ]),
  execute: async ({ input, context }) => {
    const { acceptanceCriteria, tasks } = input;
    const branch = context.get("branch");
    const project = context.get("project");

    const logger = Logger.get({
      projectId: project.id,
      versionId: branch.headVersion.id,
      input,
    });

    logger.info("Calling coder agent to start development");

    const [updatedVersion] = await db
      .update(versions)
      .set({
        status: "coding",
        acceptanceCriteria,
      })
      .where(eq(versions.id, branch.headVersion.id))
      .returning();

    if (!updatedVersion) {
      logger.error("Failed to update version");
      throw new Error(`[plannerAgent:call_coder:${project.id}] Failed to update version`);
    }

    context.set("branch", {
      ...branch,
      headVersion: updatedVersion,
    });

    await createTasks({
      taskList: tasks,
      context,
    });

    await stream(updatedVersion.chatId, {
      type: "update_branch",
      data: {
        ...branch,
        headVersion: updatedVersion,
      },
    });

    logger.info("Version updated successfully");

    return {
      success: true as const,
      tasks,
    };
  },
});
