import { db, eq } from "@weldr/db";
import { versions } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import { generateVersionDetails } from "@/ai/utils/generate-version-details";
import { getMessages } from "@/ai/utils/get-messages";
import { stream } from "@/lib/stream-utils";
import { createStep } from "../engine";

export const generateVersionDetailsStep = createStep({
  id: "generate-version-details",
  execute: async ({ context }) => {
    const project = context.get("project");
    const branch = context.get("branch");

    const logger = Logger.get({
      projectId: project.id,
      versionId: branch.headVersion.id,
    });

    // Only run if version message or description is missing
    if (branch.headVersion.message && branch.headVersion.description) {
      logger.info("Version already has message and description, skipping generation");
      return;
    }

    logger.info("Version missing message or description, generating...");

    try {
      const messages = await getMessages(branch.headVersion.chatId);

      if (messages.length === 0) {
        logger.warn("No messages found, cannot generate version details");
        return;
      }

      const versionDetails = await generateVersionDetails(messages);

      const [updatedVersion] = await db
        .update(versions)
        .set({
          message: versionDetails.message,
          description: versionDetails.description,
        })
        .where(eq(versions.id, branch.headVersion.id))
        .returning();

      if (!updatedVersion) {
        logger.error("Failed to update version with generated details");
        return;
      }

      context.set("branch", {
        ...branch,
        headVersion: {
          ...branch.headVersion,
          message: updatedVersion.message,
          description: updatedVersion.description,
        },
      });

      await stream(branch.headVersion.chatId, {
        type: "update_branch",
        data: {
          ...branch,
          headVersion: {
            ...branch.headVersion,
            message: updatedVersion.message,
            description: updatedVersion.description,
          },
        },
      });

      logger.info("Generated and updated version details", {
        message: versionDetails.message,
        description: versionDetails.description,
      });
    } catch (error) {
      logger.error("Failed to generate version details", {
        extra: { error },
      });
    }
  },
});
