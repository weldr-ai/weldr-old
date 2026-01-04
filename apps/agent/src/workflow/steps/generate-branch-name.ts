import { db, eq } from "@weldr/db";
import { branches } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";
import { getBranchDir } from "@weldr/shared/state";

import { generateBranchName } from "@/ai/utils/generate-branch-name";
import { getMessages } from "@/ai/utils/get-messages";
import { Git } from "@/lib/git";
import { stream } from "@/lib/stream-utils";
import { createStep } from "../engine";

export const generateBranchNameStep = createStep({
  id: "generate-branch-name",
  execute: async ({ context }) => {
    const project = context.get("project");
    const branch = context.get("branch");

    const logger = Logger.get({
      projectId: project.id,
      versionId: branch.headVersion.id,
    });

    // Check if name is a placeholder (temporary name from UI)
    const hasPlaceholderName =
      branch.name?.startsWith("variant/") || branch.name?.startsWith("stream/");
    if (!hasPlaceholderName) {
      logger.info("Branch has a meaningful name, skipping generation");
      return;
    }

    logger.info("Branch has placeholder name, generating meaningful name...");

    try {
      // Get all messages from the chat to use as input
      const messages = await getMessages(branch.headVersion.chatId);

      if (messages.length === 0) {
        logger.warn("No messages found, cannot generate branch name");
        return;
      }

      const oldBranchName = branch.name;
      const newBranchName = await generateBranchName(messages);

      // Update the branch in the database
      const [updatedBranch] = await db
        .update(branches)
        .set({
          name: newBranchName,
        })
        .where(eq(branches.id, branch.id))
        .returning();

      if (!updatedBranch) {
        logger.error("Failed to update branch with generated name");
        return;
      }

      // Rename the git branch
      if (oldBranchName) {
        try {
          const branchDir = getBranchDir(project.id, branch.id);
          await Git.renameBranch(oldBranchName, newBranchName, branchDir);
          logger.info("Git branch renamed", {
            extra: { oldBranchName, newBranchName },
          });
        } catch (error) {
          logger.error("Failed to rename git branch", {
            extra: { error, oldBranchName, newBranchName },
          });
          // Don't throw - database is updated, git rename is secondary
        }
      }

      // Update the context with the new data
      context.set("branch", {
        ...branch,
        name: updatedBranch.name,
      });

      // Stream the update to the UI
      await stream(branch.headVersion.chatId, {
        type: "update_branch",
        data: {
          ...branch,
          name: updatedBranch.name,
        } as typeof branch & { name: string },
      });

      logger.info("Generated and updated branch name", {
        branchName: newBranchName,
      });
    } catch (error) {
      logger.error("Failed to generate branch name", {
        extra: { error },
      });
      // Don't throw - allow workflow to continue even if name generation fails
    }
  },
});
