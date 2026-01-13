import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { and, desc, eq, type SQL } from "@weldr/db";
import { branches, versions } from "@weldr/db/schema";
import { nanoid } from "@weldr/shared/nanoid";
import type { ChatMessage } from "@weldr/shared/types";

import { protectedProcedure } from "../init";

export const branchRouter = {
  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1).max(100),
        type: z.enum(["variant", "stream"]),
        forkedFromVersionId: z.string(),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const forkedVersion = await ctx.db.query.versions.findFirst({
        where: and(
          eq(versions.id, input.forkedFromVersionId),
          eq(versions.projectId, input.projectId),
        ),
        with: {
          branch: true,
        },
      });

      if (!forkedVersion) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Forked version not found",
        });
      }

      if (forkedVersion.status !== "completed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only fork from completed versions",
        });
      }

      // Require snapshotPath for forking (same for both local and cloud modes)
      if (!forkedVersion.snapshotPath) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Source version does not have a snapshot",
        });
      }

      const existingBranch = await ctx.db.query.branches.findFirst({
        where: and(eq(branches.projectId, input.projectId), eq(branches.name, input.name)),
      });

      if (existingBranch) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Branch name already exists",
        });
      }

      // For variants: check if there's an existing forkset or create new one
      let forksetId: string | null = null;
      if (input.type === "variant") {
        const existingVariant = await ctx.db.query.branches.findFirst({
          where: and(
            eq(branches.forkedFromVersionId, input.forkedFromVersionId),
            eq(branches.type, "variant"),
          ),
        });
        forksetId = existingVariant?.forksetId ?? nanoid();
      }

      const branchId = nanoid();

      // Branch creation no longer needs to fork Tigris buckets
      // The agent will handle snapshot restoration when the branch is first accessed

      const [branch] = await ctx.db
        .insert(branches)
        .values({
          id: branchId,
          name: input.name,
          description: input.description,
          projectId: input.projectId,
          type: input.type,
          parentBranchId: input.type === "stream" ? forkedVersion.branchId : null,
          forkedFromVersionId: input.forkedFromVersionId,
          forksetId,
          userId: ctx.session.user.id,
        })
        .returning();

      if (!branch) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create branch",
        });
      }

      return branch;
    }),
  byIdOrMain: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        projectId: z.string(),
        versionId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: SQL[] = [
        eq(branches.userId, ctx.session.user.id),
        eq(branches.projectId, input.projectId),
      ];

      if (input.id) {
        where.push(eq(branches.id, input.id));
      } else {
        where.push(eq(branches.isMain, true));
      }

      const branch = await ctx.db.query.branches.findFirst({
        where: and(...where),
        with: {
          headVersion: {
            columns: {
              id: true,
              message: true,
              createdAt: true,
              parentVersionId: true,
              number: true,
              sequenceNumber: true,
              status: true,
              description: true,
              projectId: true,
              publishedAt: true,
            },
            with: {
              chat: {
                with: {
                  messages: {
                    orderBy: (messages, { asc }) => [asc(messages.createdAt)],
                    with: {
                      attachments: {
                        columns: {
                          name: true,
                          key: true,
                        },
                      },
                      user: {
                        columns: {
                          name: true,
                        },
                      },
                    },
                  },
                },
              },
              declarations: {
                with: {
                  declaration: {
                    columns: {
                      id: true,
                      metadata: true,
                      nodeId: true,
                      progress: true,
                    },
                    with: {
                      node: true,
                      dependencies: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!branch || !branch.headVersion) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Branch not found",
        });
      }
      const getMessagesWithAttachments = async (version: typeof branch.headVersion) => {
        const results = [];

        for (const message of version.chat.messages) {
          // Filter assistant messages for call_coder tool calls
          let content: unknown[] = message.content as unknown[];

          // Skip tool messages with call_coder results
          if (message.role === "tool" && Array.isArray(message.content)) {
            content = content.filter(
              (item: unknown) =>
                !(
                  typeof item === "object" &&
                  item !== null &&
                  "type" in item &&
                  item.type === "tool-result" &&
                  "toolName" in item &&
                  item.toolName === "call_coder"
                ),
            );
          } else if (message.role === "assistant") {
            content = content.filter(
              (item: unknown) =>
                !(
                  typeof item === "object" &&
                  item !== null &&
                  "type" in item &&
                  item.type === "tool-call" &&
                  "toolName" in item &&
                  item.toolName === "call_coder"
                ),
            );
          }

          if (content.length === 0) continue;

          // Return attachment URL path - client can handle URL generation
          const attachmentsWithUrls = message.attachments.map((attachment) => ({
            name: attachment.name,
            url: `/api/attachments/${attachment.key}`,
          }));

          results.push({
            ...message,
            content,
            attachments: attachmentsWithUrls,
          });
        }

        return results;
      };

      const ancestryChain: Array<{
        id: string;
        name: string;
        isMain: boolean;
      }> = [];
      let currentBranchId = branch.parentBranchId;

      while (currentBranchId) {
        const parentBranch = await ctx.db.query.branches.findFirst({
          where: and(eq(branches.id, currentBranchId), eq(branches.userId, ctx.session.user.id)),
          columns: {
            id: true,
            name: true,
            isMain: true,
            parentBranchId: true,
          },
        });

        if (!parentBranch) break;

        ancestryChain.unshift({
          id: parentBranch.id,
          name: parentBranch.name,
          isMain: parentBranch.isMain,
        });

        currentBranchId = parentBranch.parentBranchId;
      }

      let siblingVariants: Array<{
        id: string;
        name: string;
        status: "active" | "archived";
      }> = [];
      if (branch.type === "variant" && branch.forksetId) {
        const siblings = await ctx.db.query.branches.findMany({
          where: and(
            eq(branches.forksetId, branch.forksetId),
            eq(branches.userId, ctx.session.user.id),
          ),
          columns: {
            id: true,
            name: true,
            status: true,
          },
        });

        siblingVariants = siblings
          .filter((s) => s.id !== branch.id)
          .map((s) => ({ id: s.id, name: s.name, status: s.status }));
      }

      let integrationVersion: {
        versionNumber: number;
        parentBranchId: string;
      } | null = null;
      if (branch.parentBranchId) {
        const integration = await ctx.db.query.versions.findFirst({
          where: and(eq(versions.appliedFromBranchId, branch.id), eq(versions.kind, "integration")),
          columns: {
            number: true,
            branchId: true,
          },
        });

        if (integration) {
          integrationVersion = {
            versionNumber: integration.number,
            parentBranchId: integration.branchId,
          };
        }
      }

      const allBranchesInProject = await ctx.db.query.branches.findMany({
        where: and(
          eq(branches.projectId, input.projectId),
          eq(branches.userId, ctx.session.user.id),
        ),
        columns: {
          id: true,
          name: true,
          type: true,
          forkedFromVersionId: true,
        },
      });

      const branchVersions = await ctx.db.query.versions.findMany({
        where: eq(versions.branchId, branch.id),
        orderBy: (versions, { desc }) => [desc(versions.sequenceNumber)],
        columns: {
          id: true,
          number: true,
          sequenceNumber: true,
          message: true,
          description: true,
          status: true,
          kind: true,
          createdAt: true,
          publishedAt: true,
          projectId: true,
          appliedFromBranchId: true,
          revertedVersionId: true,
          branchId: true,
          userId: true,
        },
        with: {
          appliedFromBranch: {
            columns: {
              id: true,
              name: true,
            },
          },
          revertedVersion: {
            columns: {
              id: true,
              sequenceNumber: true,
              message: true,
            },
          },
        },
      });

      const versionIds = new Set(branchVersions.map((v) => v.id));

      // Create a map of versionId -> branches that forked from it
      const versionToBranchesMap = new Map<
        string,
        Array<{ id: string; name: string; type: "variant" | "stream" }>
      >();

      for (const b of allBranchesInProject) {
        if (b.forkedFromVersionId && versionIds.has(b.forkedFromVersionId)) {
          const existing = versionToBranchesMap.get(b.forkedFromVersionId) || [];
          existing.push({
            id: b.id,
            name: b.name,
            type: b.type,
          });
          versionToBranchesMap.set(b.forkedFromVersionId, existing);
        }
      }

      // Fetch selected version if versionId is provided
      let selectedVersion = null;
      if (input.versionId) {
        const version = await ctx.db.query.versions.findFirst({
          where: and(
            eq(versions.id, input.versionId),
            eq(versions.branchId, branch.id),
            eq(versions.projectId, input.projectId),
          ),
          columns: {
            id: true,
            message: true,
            createdAt: true,
            parentVersionId: true,
            number: true,
            sequenceNumber: true,
            status: true,
            description: true,
            projectId: true,
            publishedAt: true,
          },
          with: {
            chat: {
              with: {
                messages: {
                  orderBy: (messages, { asc }) => [asc(messages.createdAt)],
                  with: {
                    attachments: {
                      columns: {
                        name: true,
                        key: true,
                      },
                    },
                    user: {
                      columns: {
                        name: true,
                      },
                    },
                  },
                },
              },
            },
            declarations: {
              with: {
                declaration: {
                  columns: {
                    id: true,
                    metadata: true,
                    nodeId: true,
                    progress: true,
                  },
                  with: {
                    node: true,
                    dependencies: true,
                  },
                },
              },
            },
          },
        });

        if (version) {
          selectedVersion = {
            ...version,
            chat: {
              ...version.chat,
              messages: (await getMessagesWithAttachments(version)) as ChatMessage[],
            },
          };
        }
      }

      return {
        ...branch,
        headVersion: {
          ...branch.headVersion,
          chat: {
            ...branch.headVersion.chat,
            messages: (await getMessagesWithAttachments(branch.headVersion)) as ChatMessage[],
          },
        },
        selectedVersion,
        versions: branchVersions,
        versionToBranchesMap: Object.fromEntries(versionToBranchesMap),
        ancestryChain,
        siblingVariants,
        integrationVersion,
      };
    }),
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.branches.findMany({
        where: and(
          eq(branches.projectId, input.projectId),
          eq(branches.userId, ctx.session.user.id),
        ),
        orderBy: desc(branches.createdAt),
        with: {
          versions: {
            orderBy: desc(versions.sequenceNumber),
            with: {
              branch: {
                columns: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });
    }),
};
