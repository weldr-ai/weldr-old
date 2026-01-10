import { z } from "zod";

import { db, eq, inArray } from "@weldr/db";
import { tasks, versions } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import { extractDeclarationsFromProject } from "../utils/extract-changed-files";
import { createTool } from "./utils";

export const doneTool = createTool({
  name: "done",
  description:
    "Mark one or more tasks as completed. MUST be called when task(s) are fully complete.",
  whenToUse:
    "When you have successfully completed all the requirements of the current task or multiple tasks. Do not call this until ALL subtasks and acceptance criteria are satisfied. You can mark multiple tasks as done in a single call if you completed them together.",
  inputSchema: z.object({
    taskIds: z
      .array(z.string())
      .optional()
      .describe(
        "Optional array of specific task IDs to mark as complete. If not provided, marks the current task as complete.",
      ),
  }),
  outputSchema: z.object({
    success: z.literal(true),
    completedTasks: z.array(z.string()),
    message: z.string(),
  }),
  execute: async ({ input, context }) => {
    const project = context.get("project");
    const branch = context.get("branch");
    const currentTaskId = context.get("currentTaskId");
    const activeTasks = context.get("activeTasks");

    const logger = Logger.get({
      projectId: project.id,
      versionId: branch.headVersion.id,
    });

    // Determine which tasks to complete
    const taskIdsToComplete = input.taskIds?.length
      ? input.taskIds
      : currentTaskId
        ? [currentTaskId]
        : null;

    if (!taskIdsToComplete) {
      throw new Error("No task ID provided and no current task set in context");
    }

    if (activeTasks) {
      const invalidTasks = taskIdsToComplete.filter((id) => !activeTasks.includes(id));
      if (invalidTasks.length > 0) {
        throw new Error(
          `Cannot complete tasks that are not in the current execution plan: ${invalidTasks.join(", ")}`,
        );
      }
    }

    logger.info("Marking tasks as done by agent", {
      extra: { taskIds: taskIdsToComplete },
    });

    await db.update(tasks).set({ status: "completed" }).where(inArray(tasks.id, taskIdsToComplete));

    const taskWord = taskIdsToComplete.length === 1 ? "task" : "tasks";
    const message = `${taskIdsToComplete.length} ${taskWord} completed successfully`;

    logger.info(message, {
      extra: { completedTaskIds: taskIdsToComplete },
    });

    // Fetch the latest changedFiles from the version
    const currentVersion = await db.query.versions.findFirst({
      where: eq(versions.id, branch.headVersion.id),
      columns: { changedFiles: true },
    });

    const changedFiles = currentVersion?.changedFiles ?? [];

    // Extract declarations only from changed files (incremental extraction)
    if (changedFiles.length > 0) {
      logger.info("Extracting declarations from changed files...", {
        extra: { fileCount: changedFiles.length },
      });

      const { processed, errors } = await extractDeclarationsFromProject({
        context,
        changedFiles,
      });

      if (errors.length > 0) {
        logger.warn("Some files failed declaration extraction", {
          extra: { errorCount: errors.length, errors: errors.slice(0, 5) },
        });
      }

      logger.info(`Declaration extraction completed: ${processed} files processed`);

      // Clear changedFiles after successful extraction
      await db
        .update(versions)
        .set({ changedFiles: [] })
        .where(eq(versions.id, branch.headVersion.id));
    } else {
      logger.info("No changed files to process for declaration extraction");
    }

    return {
      success: true as const,
      completedTasks: taskIdsToComplete,
      message,
    };
  },
});
