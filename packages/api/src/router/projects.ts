import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { and, eq } from "@weldr/db";
import { attachments, branches, chatMessages, chats, projects, versions } from "@weldr/db/schema";
import { Fly } from "@weldr/shared/fly";
import { nanoid } from "@weldr/shared/nanoid";
import { isLocalMode } from "@weldr/shared/state";
import { Tigris } from "@weldr/shared/tigris";
import { insertProjectSchema, updateProjectSchema } from "@weldr/shared/validators/projects";

import { protectedProcedure } from "../init";
import { callAgentProxy } from "../utils";

export const projectsRouter = {
  create: protectedProcedure.input(insertProjectSchema).mutation(async ({ ctx, input }) => {
    const projectId = nanoid();
    const mainBranchId = nanoid();

    let developmentAppId: string | undefined;
    let productionAppId: string | undefined;

    try {
      const project = await ctx.db.transaction(async (tx) => {
        // Only create Fly apps and machines in cloud mode
        // In local mode, skip Fly.io infrastructure creation
        if (!isLocalMode()) {
          // The production app is created first
          // so we can generate a deploy token for it
          // to be used in the development app
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
            userId: ctx.session.user.id,
          })
          .returning();

        if (!project) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create project",
          });
        }

        const [chat] = await tx
          .insert(chats)
          .values({
            userId: ctx.session.user.id,
            projectId: projectId,
          })
          .returning();

        if (!chat) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create chat",
          });
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
            userId: ctx.session.user.id,
          })
          .returning();

        if (!message) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create project",
          });
        }

        if (input.attachments.length > 0) {
          await tx.insert(attachments).values(
            input.attachments.map((attachment) => ({
              key: attachment.key,
              name: attachment.name,
              contentType: attachment.contentType,
              size: attachment.size,
              messageId: message.id,
              userId: ctx.session.user.id,
            })),
          );
        }

        const [mainBranch] = await tx
          .insert(branches)
          .values({
            id: mainBranchId,
            name: "main",
            projectId,
            isMain: true,
            userId: ctx.session.user.id,
          })
          .returning();

        if (!mainBranch) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create main branch",
          });
        }

        const [version] = await tx
          .insert(versions)
          .values({
            projectId,
            userId: ctx.session.user.id,
            number: 1,
            sequenceNumber: 1,
            chatId: chat.id,
            branchId: mainBranchId,
          })
          .returning();

        if (!version) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create version",
          });
        }

        await tx
          .update(branches)
          .set({
            headVersionId: version.id,
          })
          .where(eq(branches.id, mainBranchId));

        return project;
      });

      // Trigger agent workflow without waiting for response
      callAgentProxy(
        "/trigger",
        {
          projectId,
          branchId: mainBranchId,
        },
        ctx.headers,
      ).catch((error) => {
        console.error("Failed to trigger agent workflow:", error);
      });

      return project;
    } catch (error) {
      // Only clean up Fly apps in cloud mode
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

      console.error(error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create project",
      });
    }
  }),
  list: protectedProcedure.query(async ({ ctx }) => {
    try {
      const result = await ctx.db.query.projects.findMany({
        where: eq(projects.userId, ctx.session.user.id),
      });
      return result;
    } catch (error) {
      console.error(error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to list projects",
      });
    }
  }),
  byId: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    try {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.id), eq(projects.userId, ctx.session.user.id)),
        with: {
          integrations: {
            columns: {
              id: true,
              name: true,
              key: true,
            },
            with: {
              environmentVariableMappings: {
                columns: {
                  environmentVariableId: true,
                  mapTo: true,
                },
              },
              integrationTemplate: {
                columns: {
                  id: true,
                  name: true,
                  description: true,
                  key: true,
                  isRecommended: true,
                  version: true,
                  variables: true,
                  options: true,
                  recommendedOptions: true,
                },
                with: {
                  category: true,
                },
              },
            },
          },
          environmentVariables: {
            columns: {
              secretId: false,
            },
          },
        },
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      return project;
    } catch (error) {
      console.error(error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get project",
      });
    }
  }),
  update: protectedProcedure.input(updateProjectSchema).mutation(async ({ ctx, input }) => {
    try {
      const result = await ctx.db
        .update(projects)
        .set(input.payload)
        .where(and(eq(projects.id, input.where.id), eq(projects.userId, ctx.session.user.id)))
        .returning()
        .then(([project]) => project);

      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      return result;
    } catch (error) {
      console.error(error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update project",
      });
    }
  }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const project = await ctx.db.query.projects.findFirst({
          where: and(eq(projects.id, input.id), eq(projects.userId, ctx.session.user.id)),
        });

        if (!project) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Project not found",
          });
        }

        // Only destroy Fly apps in cloud mode
        if (!isLocalMode()) {
          await Promise.all([
            Fly.app.destroy({
              type: "development",
              projectId: project.id,
            }),
            Fly.app.destroy({
              type: "preview",
              projectId: project.id,
            }),
            Fly.app.destroy({
              type: "production",
              projectId: project.id,
            }),
            Tigris.bucket.delete(`project-${project.id}`),
            Tigris.credentials.delete(project.id),
          ]);
        }

        await ctx.db
          .delete(projects)
          .where(and(eq(projects.id, input.id), eq(projects.userId, ctx.session.user.id)));
      } catch (error) {
        console.error(error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete project",
        });
      }
    }),
} satisfies TRPCRouterRecord;
