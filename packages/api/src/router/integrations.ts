import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  branches,
  environmentVariables,
  integrationEnvironmentVariables,
  integrationInstallations,
  integrations,
  integrationTemplates,
  projects,
} from "@weldr/db/schema";
import {
  createBatchIntegrationsSchema,
  createIntegrationSchema,
  updateIntegrationSchema,
} from "@weldr/shared/validators/integrations";

import { createTRPCRouter, protectedProcedure } from "../init";
import { callAgentProxy } from "../utils";

export const integrationsRouter = createTRPCRouter({
  install: protectedProcedure
    .input(
      z.object({
        integrationId: z.string(),
        snapshotId: z.string(),
        branchId: z.string(),
        chatId: z.string().optional(),
        startSession: z.boolean().optional().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        const snapshot = await tx.query.snapshots.findFirst({
          where: (snapshots, { eq }) =>
            and(eq(snapshots.id, input.snapshotId), eq(snapshots.createdBy, ctx.session.user.id)),
        });

        if (!snapshot) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Snapshot not found",
          });
        }

        // Verify integration exists and user owns it
        const integration = await tx.query.integrations.findFirst({
          where: and(
            eq(integrations.id, input.integrationId),
            eq(integrations.userId, ctx.session.user.id),
          ),
        });

        if (!integration) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Integration not found",
          });
        }

        // Check if already queued or installed
        const existingInstallation = await tx.query.integrationInstallations.findFirst({
          where: and(
            eq(integrationInstallations.integrationId, input.integrationId),
            eq(integrationInstallations.snapshotId, input.snapshotId),
          ),
        });

        if (existingInstallation) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Integration already queued or installed for this snapshot",
          });
        }

        // Create the installation queue entry
        await tx.insert(integrationInstallations).values({
          integrationId: input.integrationId,
          snapshotId: input.snapshotId,
          status: "queued",
        });

        console.log(
          `[integrations.install] Queued integration ${integration.key} for snapshot ${input.snapshotId}`,
        );

        await callAgentProxy(
          "/integrations/install",
          {
            projectId: snapshot.projectId,
            branchId: input.branchId,
            chatId: input.chatId,
            startSession: input.startSession,
          },
          ctx.headers,
        );
      });

      return { success: true };
    }),
  create: protectedProcedure.input(createIntegrationSchema).mutation(async ({ ctx, input }) => {
    await ctx.db.transaction(async (tx) => {
      const { name, projectId, integrationTemplateId, environmentVariableMappings } = input;

      const project = await tx.query.projects.findFirst({
        where: and(eq(projects.id, projectId), eq(projects.userId, ctx.session.user.id)),
        columns: { id: true },
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      const doesIntegrationExist = await tx.query.integrations.findFirst({
        where: and(
          eq(integrations.projectId, projectId),
          eq(integrations.userId, ctx.session.user.id),
          eq(integrations.integrationTemplateId, integrationTemplateId),
        ),
      });

      if (doesIntegrationExist) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Integration already exists",
        });
      }

      const integrationTemplate = await tx.query.integrationTemplates.findFirst({
        where: eq(integrationTemplates.id, integrationTemplateId),
      });

      if (!integrationTemplate) {
        console.error(`[integrations.create:${projectId}] Failed to find integration template`);
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Failed to create integration",
        });
      }

      const [integration] = await tx
        .insert(integrations)
        .values({
          key: integrationTemplate.key,
          name,
          projectId,
          userId: ctx.session.user.id,
          integrationTemplateId,
          options: integrationTemplate.recommendedOptions,
        })
        .returning();

      if (!integration) {
        console.error(`[integrations.create:${projectId}] Failed to create integration`);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create integration",
        });
      }

      const integrationVariables = (integrationTemplate.variables ?? []).map((v) => v.name);

      for (const mapping of environmentVariableMappings) {
        const envVarKey = await tx.query.environmentVariables.findFirst({
          where: eq(environmentVariables.id, mapping.envVarId),
        });

        if (!envVarKey) {
          console.error(`[integrations.create:${projectId}] Failed to find environment variable`);
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Failed to create integration",
          });
        }

        if (
          !integrationVariables.includes(envVarKey.key as (typeof integrationVariables)[number])
        ) {
          console.error(`[plugins.create:${projectId}] Environment variable not in config`);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Failed to create integration",
          });
        }

        await tx.insert(integrationEnvironmentVariables).values({
          integrationId: integration.id,
          mapTo: mapping.configKey,
          environmentVariableId: envVarKey.id,
        });
      }

      // If branchId is provided, queue the integration for installation on that branch's snapshot
      if (input.branchId) {
        const branch = await tx.query.branches.findFirst({
          where: and(eq(branches.id, input.branchId), eq(branches.projectId, projectId)),
        });

        if (branch?.snapshotId) {
          await tx.insert(integrationInstallations).values({
            integrationId: integration.id,
            snapshotId: branch.snapshotId,
            status: "queued",
          });

          console.log(
            `[integrations.create:${projectId}] Queued integration ${integration.key} for snapshot ${branch.snapshotId}`,
          );
        } else {
          console.warn(
            `[integrations.create:${projectId}] Branch ${input.branchId} has no snapshot`,
          );
        }
      }

      return integration;
    });

    // Trigger installation if branchId was provided
    if (input.branchId) {
      try {
        await callAgentProxy(
          "/integrations/install",
          {
            projectId: input.projectId,
            branchId: input.branchId,
            startSession: false,
          },
          ctx.headers,
        );

        console.log(`[integrations.create:${input.projectId}] Installation triggered successfully`);
      } catch (error) {
        console.error(
          `[integrations.create:${input.projectId}] Failed to trigger installation:`,
          error,
        );
      }
    }
  }),
  byId: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const integration = await ctx.db.query.integrations.findFirst({
      where: and(eq(integrations.id, input.id), eq(integrations.userId, ctx.session.user.id)),
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
            variables: true,
          },
        },
      },
    });

    if (!integration) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Integration not found",
      });
    }

    return integration;
  }),
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.query.integrations.findMany({
        where: and(
          eq(integrations.projectId, input.projectId),
          eq(integrations.userId, ctx.session.user.id),
        ),
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
              variables: true,
            },
          },
        },
        orderBy: desc(integrations.id),
      });

      return items;
    }),
  update: protectedProcedure.input(updateIntegrationSchema).mutation(async ({ ctx, input }) => {
    await ctx.db.transaction(async (tx) => {
      const existingIntegration = await tx.query.integrations.findFirst({
        where: and(
          eq(integrations.id, input.where.id),
          eq(integrations.userId, ctx.session.user.id),
        ),
      });

      if (!existingIntegration) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Integration not found",
        });
      }

      const [updatedIntegration] = await tx
        .update(integrations)
        .set({
          name: input.payload.name ?? existingIntegration.name,
        })
        .where(eq(integrations.id, input.where.id))
        .returning();

      if (!updatedIntegration) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update integration",
        });
      }

      if (input.payload.environmentVariableMappings) {
        for (const mapping of input.payload.environmentVariableMappings) {
          const envVarKey = await tx.query.environmentVariables.findFirst({
            where: eq(environmentVariables.id, mapping.envVarId),
          });

          if (!envVarKey) {
            console.error(
              `[integrations.update:${input.where.id}] Failed to find environment variable`,
            );
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Failed to update integration",
            });
          }

          await tx
            .insert(integrationEnvironmentVariables)
            .values({
              mapTo: mapping.configKey,
              environmentVariableId: envVarKey.id,
              integrationId: input.where.id,
            })
            .onConflictDoUpdate({
              target: [
                integrationEnvironmentVariables.integrationId,
                integrationEnvironmentVariables.environmentVariableId,
                integrationEnvironmentVariables.mapTo,
              ],
              set: {
                mapTo: mapping.configKey,
              },
            });
        }
      }

      return updatedIntegration;
    });
  }),
  createBatch: protectedProcedure
    .input(createBatchIntegrationsSchema)
    .mutation(async ({ ctx, input }) => {
      const createdIntegrations = await ctx.db.transaction(async (tx) => {
        const results = [];

        const project = await tx.query.projects.findFirst({
          where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.session.user.id)),
          columns: { id: true },
        });

        if (!project) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Project not found",
          });
        }

        let snapshotId: string | null = null;
        if (input.branchId) {
          const branch = await tx.query.branches.findFirst({
            where: and(eq(branches.id, input.branchId), eq(branches.projectId, input.projectId)),
          });
          snapshotId = branch?.snapshotId ?? null;

          if (!snapshotId) {
            console.warn(
              `[integrations.createBatch:${input.projectId}] Branch ${input.branchId} has no snapshot`,
            );
          }
        }

        for (const integrationData of input.integrations) {
          const { name, integrationTemplateId, environmentVariableMappings } = integrationData;

          const existingIntegration = await tx.query.integrations.findFirst({
            where: and(
              eq(integrations.projectId, input.projectId),
              eq(integrations.userId, ctx.session.user.id),
              eq(integrations.integrationTemplateId, integrationTemplateId),
            ),
          });

          if (existingIntegration) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Integration with template ${integrationTemplateId} already exists`,
            });
          }

          const integrationTemplate = await tx.query.integrationTemplates.findFirst({
            where: eq(integrationTemplates.id, integrationTemplateId),
          });

          if (!integrationTemplate) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Integration template ${integrationTemplateId} not found`,
            });
          }

          const [integration] = await tx
            .insert(integrations)
            .values({
              key: integrationTemplate.key,
              name,
              projectId: input.projectId,
              userId: ctx.session.user.id,
              integrationTemplateId,
              options: integrationTemplate.recommendedOptions,
            })
            .returning();

          if (!integration) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to create integration",
            });
          }

          const integrationVariables = (integrationTemplate.variables ?? []).map((v) => v.name);

          for (const mapping of environmentVariableMappings) {
            const envVar = await tx.query.environmentVariables.findFirst({
              where: eq(environmentVariables.id, mapping.envVarId),
            });

            if (!envVar) {
              throw new TRPCError({
                code: "NOT_FOUND",
                message: `Environment variable ${mapping.envVarId} not found`,
              });
            }

            const isValidVariable = integrationVariables.some(
              (variable) => variable === mapping.configKey,
            );

            if (!isValidVariable) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Configuration key ${mapping.configKey} not valid for this integration`,
              });
            }

            await tx.insert(integrationEnvironmentVariables).values({
              integrationId: integration.id,
              mapTo: mapping.configKey,
              environmentVariableId: envVar.id,
            });
          }

          // Queue integration for installation if branchId is provided
          if (snapshotId) {
            await tx.insert(integrationInstallations).values({
              integrationId: integration.id,
              snapshotId: snapshotId,
              status: "queued",
            });

            console.log(
              `[integrations.createBatch:${input.projectId}] Queued integration ${integration.key} for snapshot ${snapshotId}`,
            );
          }

          results.push(integration);
        }

        return results;
      });

      // Trigger installation if branchId was provided
      if (input.branchId) {
        try {
          await callAgentProxy(
            "/integrations/install",
            {
              projectId: input.projectId,
              branchId: input.branchId,
              chatId: input.chatId,
              startSession: input.startSession ?? false,
            },
            ctx.headers,
          );

          console.log(
            `[integrations.createBatch:${input.projectId}] Installation triggered successfully`,
          );
        } catch (error) {
          console.error(
            `[integrations.createBatch:${input.projectId}] Failed to trigger installation:`,
            error,
          );
        }
      }

      return createdIntegrations;
    }),
});
