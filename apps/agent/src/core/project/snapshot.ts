import { generateText, Output, type ModelMessage } from "ai";
import { z } from "zod";

import { and, db, eq } from "@weldr/db";
import {
  branches,
  chats,
  snapshotDeclarations,
  snapshotParents,
  snapshots,
} from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";
import { nanoid } from "@weldr/shared/nanoid";

import { registry } from "@/ai/providers";

/**
 * Initialize a chat session on a branch.
 * In the new model, chats are created for branches (not versions).
 * Snapshots are created when work is completed.
 */
export const initChat = async ({
  projectId,
  branchId,
  userId,
}: {
  projectId: string;
  branchId: string;
  userId: string;
}): Promise<typeof chats.$inferSelect & { branch: typeof branches.$inferSelect }> => {
  const logger = Logger.get({
    projectId,
    branchId,
  });

  return db.transaction(async (tx) => {
    // Get the branch
    const branch = await tx.query.branches.findFirst({
      where: and(eq(branches.projectId, projectId), eq(branches.id, branchId)),
    });

    if (!branch) {
      throw new Error("Branch not found");
    }

    logger.info("Creating chat for branch...");
    // Create the chat linked to this branch
    const [chat] = await tx
      .insert(chats)
      .values({
        projectId,
        userId,
        branchId,
      })
      .returning();

    if (!chat) {
      throw new Error("Failed to create chat");
    }

    return { ...chat, branch };
  });
};

/**
 * Create a snapshot and advance the branch to it.
 * This is called when work is completed on a branch.
 */
export const createSnapshot = async ({
  projectId,
  branchId,
  commitSha,
  title,
  description,
  metrics,
  userId,
}: {
  projectId: string;
  branchId: string;
  commitSha: string;
  title: string;
  description?: string;
  metrics?: {
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
  };
  userId: string;
}): Promise<typeof snapshots.$inferSelect> => {
  const logger = Logger.get({
    projectId,
    branchId,
  });

  return db.transaction(async (tx) => {
    // Get the branch with its current snapshot
    const branch = await tx.query.branches.findFirst({
      where: and(eq(branches.projectId, projectId), eq(branches.id, branchId)),
      with: {
        snapshot: {
          with: {
            declarations: true,
          },
        },
      },
    });

    if (!branch) {
      throw new Error("Branch not found");
    }

    const snapshotId = nanoid();

    logger.info("Creating snapshot...", { extra: { snapshotId, commitSha } });

    // Create the new snapshot
    const [snapshot] = await tx
      .insert(snapshots)
      .values({
        id: snapshotId,
        projectId,
        commitSha,
        title,
        description,
        inputTokens: metrics?.inputTokens ?? 0,
        outputTokens: metrics?.outputTokens ?? 0,
        totalCost: metrics?.totalCost ?? 0,
        createdBy: userId,
      })
      .returning();

    if (!snapshot) {
      throw new Error("Failed to create snapshot");
    }

    // Link to parent snapshot if exists
    if (branch.snapshotId) {
      logger.info("Linking to parent snapshot...", { extra: { parentId: branch.snapshotId } });
      await tx.insert(snapshotParents).values({
        snapshotId,
        parentId: branch.snapshotId,
      });
    }

    // Copy declarations from parent snapshot
    if (branch.snapshot?.declarations && branch.snapshot.declarations.length > 0) {
      logger.info(`Copying ${branch.snapshot.declarations.length} declarations...`);
      await tx.insert(snapshotDeclarations).values(
        branch.snapshot.declarations.map((decl) => ({
          snapshotId,
          declarationId: decl.declarationId,
        })),
      );
    }

    // Update the branch to point to the new snapshot
    await tx
      .update(branches)
      .set({
        snapshotId,
        updatedAt: new Date(),
      })
      .where(eq(branches.id, branchId));

    logger.info("Snapshot created and branch advanced", { extra: { snapshotId } });

    return snapshot;
  });
};

const snapshotDetailsSchema = z.object({
  title: z
    .string()
    .describe(
      "Commit message following conventional commit format. Should be a single sentence that captures the essence of the changes.",
    ),
  description: z
    .string()
    .describe(
      "Comprehensive description of the changes, including requirements, objectives, and scope. Should start with present tense verbs.",
    ),
});

export async function generateSnapshotDetails(
  messages: ModelMessage[],
): Promise<{ title: string; description: string }> {
  const result = await generateText({
    system:
      "You are a helpful assistant that generates concise, professional commit messages and comprehensive descriptions.",
    model: registry.languageModel("google:gemini-2.5-flash"),
    messages: [
      ...messages,
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Based on the conversation history, generate a commit message (title) and description that summarize the changes.",
          },
        ],
      },
    ],
    output: Output.object({ schema: snapshotDetailsSchema }),
    maxOutputTokens: 1024,
  });

  if (!result.output) {
    throw new Error("Failed to generate snapshot details: no output from model");
  }

  Logger.info("Generated snapshot details", {
    title: result.output.title,
    description: result.output.description,
  });

  return result.output;
}
