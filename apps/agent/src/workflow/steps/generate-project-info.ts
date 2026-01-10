import { db, eq } from "@weldr/db";
import { projects } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import { generateProjectInfo } from "@/ai/utils/generate-project-info";
import { getMessages } from "@/ai/utils/get-messages";
import { stream } from "@/lib/stream-utils";
import { createStep } from "../engine";

export const generateProjectInfoStep = createStep({
  id: "generate-project-info",
  execute: async ({ context }) => {
    const project = context.get("project");
    const branch = context.get("branch");

    const logger = Logger.get({
      projectId: project.id,
      versionId: branch.headVersion.id,
    });

    // Only run if project is missing title or description
    if (project.title && project.description) {
      logger.info("Project already has title and description, skipping generation");
      return;
    }

    logger.info("Project missing title or description, generating...");

    try {
      // Get the first user message from the chat to use as input
      const messages = await getMessages(branch.headVersion.chatId);

      const projectInfo = await generateProjectInfo(messages);

      // Update the project in the database
      const [updatedProject] = await db
        .update(projects)
        .set({
          title: projectInfo.title,
          description: projectInfo.description,
        })
        .where(eq(projects.id, project.id))
        .returning();

      if (!updatedProject) {
        logger.error("Failed to update project with generated info");
        return;
      }

      // Update the context with the new project data
      context.set("project", {
        ...project,
        title: updatedProject.title,
        description: updatedProject.description,
      });

      // Stream the update to the UI
      await stream(branch.headVersion.chatId, {
        type: "update_project",
        data: {
          id: updatedProject.id,
          title: updatedProject.title,
          description: updatedProject.description,
          subdomain: updatedProject.subdomain,
          userId: updatedProject.userId,
          createdAt: updatedProject.createdAt,
          updatedAt: updatedProject.updatedAt,
        },
      });

      logger.info("Generated and updated project title and description", {
        title: projectInfo.title,
        description: projectInfo.description,
      });
    } catch (error) {
      logger.error("Failed to generate project info", {
        extra: { error },
      });
      // Don't throw - allow workflow to continue even if title generation fails
    }
  },
});
