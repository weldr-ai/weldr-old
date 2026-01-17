import { getLogger } from "@orpc/experimental-pino";
import { type Route, ORPCError } from "@orpc/server";

import { eq } from "@weldr/db";
import { attachments, branches, chatMessages, chats, projects, snapshots } from "@weldr/db/schema";
import { Fly } from "@weldr/shared/fly";
import { nanoid } from "@weldr/shared/nanoid";
import { Tigris } from "@weldr/shared/tigris";
import { insertProjectSchema } from "@weldr/shared/validators/projects";

import { protectedProcedure } from "@/lib/procedures";
import { callAgentProxy, isLocalMode } from "@/lib/utils";
import { useDb } from "@/middlewares/db";

const definition = {
  method: "POST",
  tags: ["Projects"],
  path: "/projects",
  successStatus: 201,
  description: "Create a new project",
  summary: "Create project",
} satisfies Route;

export default protectedProcedure
  .route(definition)
  .input(insertProjectSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const logger = getLogger(context);
    const userId = context.user.id;

    logger?.info({ userId }, "Creating project");

    const projectId = nanoid();
    const mainBranchId = nanoid();

    let developmentAppId: string | undefined;
    let productionAppId: string | undefined;

    try {
      const project = await context.db.transaction(async (tx) => {
        if (!isLocalMode()) {
          productionAppId = await Fly.app.create({
            type: "production",
            projectId,
          });

          developmentAppId = await Fly.app.create({
            type: "development",
            projectId,
            branchId: mainBranchId,
          });
        }

        const [project] = await tx
          .insert(projects)
          .values({
            id: projectId,
            subdomain: projectId,
            userId,
          })
          .returning();

        if (!project) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to create project" });
        }

        const [chat] = await tx
          .insert(chats)
          .values({
            userId,
            projectId: projectId,
          })
          .returning();

        if (!chat) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to create chat" });
        }

        const [message] = await tx
          .insert(chatMessages)
          .values({
            chatId: chat.id,
            role: "user",
            content: [
              {
                type: "text",
                text: input.message,
              },
            ],
            userId,
          })
          .returning();

        if (!message) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to create project" });
        }

        if (input.attachments.length > 0) {
          await tx.insert(attachments).values(
            input.attachments.map((attachment) => ({
              key: attachment.key,
              name: attachment.name,
              contentType: attachment.contentType,
              size: attachment.size,
              messageId: message.id,
              userId,
            })),
          );
        }

        const [mainBranch] = await tx
          .insert(branches)
          .values({
            id: mainBranchId,
            name: "main",
            projectId,
            userId,
            createdBy: userId,
          })
          .returning();

        if (!mainBranch) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to create main branch" });
        }

        const [snapshot] = await tx
          .insert(snapshots)
          .values({
            projectId,
            userId,
            createdBy: userId,
            title: "Initial snapshot",
          })
          .returning();

        if (!snapshot) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to create snapshot" });
        }

        await tx
          .update(branches)
          .set({
            snapshotId: snapshot.id,
          })
          .where(eq(branches.id, mainBranchId));

        return project;
      });

      callAgentProxy(
        "/trigger",
        {
          projectId,
          branchId: mainBranchId,
        },
        context.reqHeaders,
      ).catch((error) => {
        logger?.error(
          { error, projectId, branchId: mainBranchId },
          "Failed to trigger agent workflow",
        );
      });

      return project;
    } catch (error) {
      if (!isLocalMode()) {
        const promises = [];

        if (developmentAppId) {
          promises.push(Fly.app.destroy({ type: "development", projectId }));
          promises.push(Tigris.bucket.delete(`project-${projectId}-branch-${mainBranchId}`));
          promises.push(Tigris.credentials.delete(projectId));
        }

        if (productionAppId) {
          promises.push(Fly.app.destroy({ type: "production", projectId }));
        }

        await Promise.all(promises);
      }

      logger?.error({ error, projectId }, "Failed to create project");
      if (error instanceof ORPCError) {
        throw error;
      }
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to create project" });
    }
  });
