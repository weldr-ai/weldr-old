import { stepCountIs, streamText, type ToolSet } from "ai";
import type z from "zod";

import { db, eq } from "@weldr/db";
import { tasks, versions } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";
import { getBranchDir } from "@weldr/shared/state";
import type { addMessageItemSchema } from "@weldr/shared/validators/chats";

import { bashTool, doneTool, searchCodebaseTool } from "@/ai/tools";
import { getMessages } from "@/ai/utils/get-messages";
import { insertMessages } from "@/ai/utils/insert-messages";
import { registry } from "@/ai/utils/registry";
import { getTaskExecutionPlan, type TaskWithRelations } from "@/ai/utils/tasks";
import { Git } from "@/lib/git";
import { stream } from "@/lib/stream-utils";
import type { WorkflowContext } from "@/workflow/context";
import { prompts } from "../prompts";
import { queryRelatedDeclarationsTool } from "../tools/query-related-declarations";
import { calculateModelCost } from "../utils/providers-pricing";

export async function coderAgent({
  context,
  coolDownPeriod = 100,
}: {
  context: WorkflowContext;
  coolDownPeriod?: number;
}) {
  const project = context.get("project");
  const branch = context.get("branch");
  const user = context.get("user");

  const logger = Logger.get({
    projectId: project.id,
    versionId: branch.headVersion.id,
  });

  logger.info("Starting coder agent");

  const executionPlan = await getTaskExecutionPlan({
    versionId: branch.headVersion.id,
  });

  logger.info(`Execution plan retrieved with ${executionPlan.length} tasks.`);

  context.set(
    "activeTasks",
    executionPlan.map((t) => t.id),
  );

  const allTaskContexts = await Promise.all(
    executionPlan.map(async (task) => {
      const taskContext = createTaskContext(task);
      return {
        taskId: task.id,
        taskName: task.data.summary,
        context: taskContext,
      };
    }),
  );

  const currentProgress: Map<
    string,
    {
      summary: string;
      progress: "pending" | "in_progress" | "completed" | "failed" | "retrying";
      retryAttempt?: number;
      maxRetries?: number;
    }
  > = new Map();

  for (const task of executionPlan) {
    const taskName = task.data.summary;

    logger.info(`Processing task: ${taskName}`);

    const [currentTaskState] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, task.id));

    if (currentTaskState?.status === "completed") {
      logger.info(`Task ${taskName} already completed, skipping`);
      currentProgress.set(task.id, {
        summary: task.data.summary,
        progress: "completed",
      });
      continue;
    }

    await db
      .update(tasks)
      .set({ status: "in_progress" })
      .where(eq(tasks.id, task.id));

    context.set("currentTaskId", task.id);

    const maxRetries = 3;
    let retryCount = 0;
    let taskCompleted = false;

    while (retryCount < maxRetries && !taskCompleted) {
      try {
        await executeTaskCoder({
          context,
          task,
          progress: currentProgress,
          allTaskContexts,
          coolDownPeriod,
        });

        const [updatedTask] = await db
          .select()
          .from(tasks)
          .where(eq(tasks.id, task.id));

        if (updatedTask?.status === "completed") {
          logger.info(`Task "${taskName}" completed successfully`);
          currentProgress.set(task.id, {
            summary: task.data.summary,
            progress: "completed",
          });
          taskCompleted = true;
        } else {
          throw new Error(
            "Task execution completed but 'done' tool was not called. Task may be incomplete.",
          );
        }
      } catch (error) {
        retryCount++;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(
          `Task "${taskName}" failed (attempt ${retryCount}/${maxRetries}): ${errorMessage}`,
          {
            extra: { error, taskId: task.id, retryCount },
          },
        );

        if (retryCount < maxRetries) {
          currentProgress.set(task.id, {
            summary: task.data.summary,
            progress: "retrying",
            retryAttempt: retryCount,
            maxRetries,
          });

          await new Promise((resolve) =>
            setTimeout(resolve, coolDownPeriod * 2),
          );

          await db
            .update(tasks)
            .set({ status: "in_progress" })
            .where(eq(tasks.id, task.id));

          currentProgress.set(task.id, {
            summary: task.data.summary,
            progress: "in_progress",
            retryAttempt: retryCount + 1,
            maxRetries,
          });
        } else {
          await db
            .update(tasks)
            .set({ status: "failed" })
            .where(eq(tasks.id, task.id));

          currentProgress.set(task.id, {
            summary: task.data.summary,
            progress: "failed",
            retryAttempt: maxRetries,
            maxRetries,
          });
        }
      }
    }
  }

  context.set("currentTaskId", undefined);
  context.set("activeTasks", undefined);

  const branchDir = getBranchDir(project.id, branch.id);

  const commitHash = await Git.commit(
    branch.headVersion.message ?? "commit message",
    { name: user.name, email: user.email },
    branchDir,
  );

  logger.info("All tasks processed. Updating version progress to 'complete'.");
  await db
    .update(versions)
    .set({ status: "completed", commitHash })
    .where(eq(versions.id, branch.headVersion.id));

  const updatedVersion = {
    ...branch.headVersion,
    status: "completed" as const,
    commitHash,
  };

  context.set("branch", { ...branch, headVersion: updatedVersion });

  await stream(branch.headVersion.chatId, {
    type: "update_branch",
    data: {
      ...branch,
      headVersion: updatedVersion,
    },
  });

  logger.info("Coder agent completed");

  await stream(branch.headVersion.chatId, { type: "end" });
}

async function executeTaskCoder({
  context,
  task,
  progress,
  allTaskContexts,
  coolDownPeriod = 1000,
}: {
  context: WorkflowContext;
  task: TaskWithRelations;
  progress: Map<
    string,
    {
      summary: string;
      progress: "pending" | "in_progress" | "completed" | "failed" | "retrying";
      retryAttempt?: number;
      maxRetries?: number;
    }
  >;
  allTaskContexts: Array<{
    taskId: string;
    taskName: string;
    context: string;
  }>;
  coolDownPeriod?: number;
}) {
  const project = context.get("project");
  const branch = context.get("branch");
  const user = context.get("user");

  const logger = Logger.get({
    projectId: project.id,
    versionId: branch.headVersion.id,
    taskId: task.id,
  });

  logger.info("Starting task coder");

  const tools: ToolSet = {
    bash: bashTool(context),
    search_codebase: searchCodebaseTool(context),
    query_related_declarations: queryRelatedDeclarationsTool(context),
    done: doneTool(context),
  };

  const progressDisplay = Array.from(progress.entries())
    .map(([_id, { summary, progress: status, retryAttempt, maxRetries }]) => {
      const icon =
        status === "completed"
          ? "✓"
          : status === "in_progress"
            ? "◐"
            : status === "retrying"
              ? "⟳"
              : status === "failed"
                ? "✗"
                : "○";

      let statusText: string = status;
      if (status === "retrying" && retryAttempt && maxRetries) {
        statusText = `retrying (attempt ${retryAttempt}/${maxRetries})`;
      } else if (status === "failed" && retryAttempt && maxRetries) {
        statusText = `failed after ${retryAttempt} attempts`;
      }

      return `[${icon}] ${summary} (${statusText})`;
    })
    .join("\n");

  const currentTaskEntry = Array.from(progress.entries()).find(
    ([_id, { progress: status }]) =>
      status === "in_progress" || status === "retrying",
  );

  const currentTaskInfo = currentTaskEntry
    ? (() => {
        const [, taskProgress] = currentTaskEntry;
        return `\n\n**CURRENT STATE:** Working on task "${taskProgress.summary}"`;
      })()
    : "";

  // Build all tasks context section with progress indicators
  // Sort tasks by status: completed first, then in_progress/retrying, then pending/failed
  const sortedTaskContexts = [...allTaskContexts].sort((a, b) => {
    const statusA = progress.get(a.taskId)?.progress ?? "pending";
    const statusB = progress.get(b.taskId)?.progress ?? "pending";

    const statusOrder = {
      completed: 0,
      in_progress: 1,
      retrying: 1,
      pending: 2,
      failed: 3,
    };

    return statusOrder[statusA] - statusOrder[statusB];
  });

  const allTasksContext = sortedTaskContexts
    .map((taskCtx) => {
      const taskProgress = progress.get(taskCtx.taskId);
      const status = taskProgress?.progress ?? "pending";
      const icon =
        status === "completed"
          ? "✓"
          : status === "in_progress"
            ? "◐"
            : status === "retrying"
              ? "⟳"
              : status === "failed"
                ? "✗"
                : "○";

      let statusText: string = status;
      if (
        status === "retrying" &&
        taskProgress?.retryAttempt &&
        taskProgress?.maxRetries
      ) {
        statusText = `retrying (attempt ${taskProgress.retryAttempt}/${taskProgress.maxRetries})`;
      } else if (
        status === "failed" &&
        taskProgress?.retryAttempt &&
        taskProgress?.maxRetries
      ) {
        statusText = `failed after ${taskProgress.retryAttempt} attempts`;
      }

      return `[${icon}] ${statusText.toUpperCase()}\n${taskCtx.context}`;
    })
    .join("\n\n");

  const versionContext = `${branch.headVersion.message}
  Description: ${branch.headVersion.description}
  Acceptance Criteria: ${branch.headVersion.acceptanceCriteria}

  **ALL TASKS CONTEXT:**
  ${allTasksContext}

  ==========================================
  **TASK EXECUTION STATE MACHINE (SUMMARY):**
  Progress:
  ${progressDisplay}${currentTaskInfo}

  **STATE TRANSITIONS:**
  - ○ pending → ◐ in_progress (when task starts)
  - ◐ in_progress → ✓ completed (when task succeeds)
  - ◐ in_progress → ⟳ retrying (when task fails, will retry)
  - ⟳ retrying → ◐ in_progress (retry attempt in progress)
  - ⟳ retrying → ✗ failed (if all retries exhausted)
  - ✗ failed (task will be skipped, moving to next task)
  ==========================================`;

  const system = await prompts.generalCoder(project, versionContext);

  const executeCoderLoop = async (): Promise<boolean> => {
    let shouldRecur = false;
    const promptMessages = await getMessages(branch.headVersion.chatId);

    const result = streamText({
      model: registry.languageModel("google:gemini-2.5-pro"),
      system,
      tools,
      messages: promptMessages,
      stopWhen: stepCountIs(10),
      onError: (error) => {
        logger.error("Error in coder agent", {
          extra: { error },
        });
      },
    });

    for await (const part of result.fullStream) {
      switch (part.type) {
        case "tool-result": {
          if (part.toolName !== "done") {
            shouldRecur = true;
          }
          break;
        }
        case "tool-error": {
          shouldRecur = true;
          break;
        }
      }
    }

    const usage = await result.usage;

    const cost = await calculateModelCost(
      "google:gemini-2.5-pro",
      usage?.inputTokens ?? 0,
      usage?.outputTokens ?? 0,
    );

    const finishReason = await result.finishReason;

    const fullResponse = await result.response;

    const messagesToSave: z.infer<typeof addMessageItemSchema>[] = [];

    for (const message of fullResponse.messages) {
      switch (message.role) {
        case "assistant": {
          messagesToSave.push({
            role: "assistant",
            content: Array.isArray(message.content)
              ? message.content
              : [{ type: "text", text: message.content }],
            metadata: {
              provider: "google",
              model: "gemini-2.5-pro",
              inputTokens: usage?.inputTokens,
              outputTokens: usage?.outputTokens,
              totalTokens: usage?.totalTokens,
              inputCost: cost?.inputCost,
              outputCost: cost?.outputCost,
              totalCost: cost?.totalCost,
              inputTokensPrice: cost?.inputTokensPrice,
              outputTokensPrice: cost?.outputTokensPrice,
              inputImagesPrice: cost?.inputImagesPrice,
              finishReason,
            },
            createdAt: new Date(),
          });
          break;
        }
        case "tool": {
          messagesToSave.push({
            ...message,
            createdAt: new Date(),
          });
          break;
        }
      }
    }

    await insertMessages({
      input: {
        chatId: branch.headVersion.chatId,
        userId: user.id,
        messages: messagesToSave,
      },
    });

    if (finishReason === "length") {
      shouldRecur = true;
    }

    return shouldRecur;
  };

  let shouldContinue = true;
  let iterationCount = 0;
  const maxIterations = 10;

  while (shouldContinue && iterationCount < maxIterations) {
    iterationCount++;
    logger.info(
      `Starting coder agent iteration ${iterationCount} for task ${task.id}`,
    );

    shouldContinue = await executeCoderLoop();

    logger.info(
      `Coder agent iteration ${iterationCount} completed for task ${task.id}`,
      {
        extra: { shouldContinue },
      },
    );

    if (shouldContinue) {
      logger.info(`Recurring in ${coolDownPeriod}ms...`);
      await new Promise((resolve) => setTimeout(resolve, coolDownPeriod));
    }
  }

  if (iterationCount >= maxIterations) {
    logger.error(
      `Task ${task.id} exceeded maximum iterations (${maxIterations}) without calling done tool`,
    );
    throw new Error(
      `Task exceeded maximum iterations (${maxIterations}) without calling done tool. Task may be stuck.`,
    );
  }

  logger.info(`Coder agent completed for task ${task.id}`);
}

function createTaskContext(task: TaskWithRelations): string {
  return `=== TASK: ${task.data.summary} ===

Description: ${task.data.description}

Acceptance Criteria:
${task.data.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}

${task.data.implementationNotes ? `Implementation Notes:\n${task.data.implementationNotes.map((n) => `- ${n}`).join("\n")}\n` : ""}
${task.data.subTasks ? `Sub-tasks:\n${task.data.subTasks.map((s) => `- ${s}`).join("\n")}\n` : ""}
Note:
- Implement this task based on the description and acceptance criteria
- Read existing files to understand patterns before implementing
- You can implement any utility functions, components, or other code you need
===`;
}
