import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { and, desc, eq, inArray } from "@weldr/db";
import { branches, snapshotParents, snapshots } from "@weldr/db/schema";
import { nanoid } from "@weldr/shared/nanoid";

import { protectedProcedure, publicProcedure } from "../init";

export const branchRouter = {
  /**
   * List branches for a project
   */
  list: publicProcedure.input(z.object({ projectId: z.string() })).query(async ({ ctx, input }) => {
    return ctx.db.query.branches.findMany({
      where: eq(branches.projectId, input.projectId),
      with: {
        snapshot: true,
      },
      orderBy: [desc(branches.updatedAt)],
    });
  }),

  /**
   * Get a branch by ID
   */
  get: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const branch = await ctx.db.query.branches.findFirst({
      where: eq(branches.id, input.id),
      with: {
        snapshot: true,
        project: {
          columns: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (!branch) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Branch not found",
      });
    }

    return branch;
  }),

  /**
   * Get a branch by ID or fall back to main branch
   * This is used by the frontend to get branch data with full snapshot history
   */
  byIdOrMain: publicProcedure
    .input(
      z.object({
        id: z.string().optional(),
        projectId: z.string(),
        snapshotId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      let branch;

      if (input.id) {
        // Get by ID
        branch = await ctx.db.query.branches.findFirst({
          where: and(eq(branches.id, input.id), eq(branches.projectId, input.projectId)),
          with: {
            snapshot: {
              with: {
                declarations: {
                  with: {
                    declaration: {
                      with: {
                        dependencies: true,
                        node: true,
                      },
                    },
                  },
                },
              },
            },
            chats: {
              orderBy: (chats, { desc }) => [desc(chats.createdAt)],
              limit: 10,
              with: {
                messages: {
                  orderBy: (messages, { asc }) => [asc(messages.createdAt)],
                  with: {
                    attachments: true,
                  },
                },
              },
            },
          },
        });
      } else {
        // Fall back to main branch
        branch = await ctx.db.query.branches.findFirst({
          where: and(eq(branches.projectId, input.projectId), eq(branches.name, "main")),
          with: {
            snapshot: {
              with: {
                declarations: {
                  with: {
                    declaration: {
                      with: {
                        dependencies: true,
                        node: true,
                      },
                    },
                  },
                },
              },
            },
            chats: {
              orderBy: (chats, { desc }) => [desc(chats.createdAt)],
              limit: 10,
              with: {
                messages: {
                  orderBy: (messages, { asc }) => [asc(messages.createdAt)],
                  with: {
                    attachments: true,
                  },
                },
              },
            },
          },
        });
      }

      if (!branch) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Branch not found",
        });
      }

      // Get snapshot history (ancestors)
      const snapshotHistory: (typeof snapshots.$inferSelect)[] = [];
      if (branch.snapshot) {
        let currentId: string | null = branch.snapshot.id;
        const visited = new Set<string>();

        while (currentId && !visited.has(currentId) && snapshotHistory.length < 50) {
          visited.add(currentId);

          // Explicitly type the result to avoid circular reference issues
          const snapshotWithParents:
            | (typeof snapshots.$inferSelect & {
                parentEdges?: { snapshotId: string; parentId: string }[];
              })
            | undefined = await ctx.db.query.snapshots.findFirst({
            where: eq(snapshots.id, currentId),
            with: {
              parentEdges: true,
            },
          });

          if (snapshotWithParents) {
            snapshotHistory.push(snapshotWithParents);
            // Get first parent (linear history for now)
            const firstParentEdge: { snapshotId: string; parentId: string } | undefined =
              snapshotWithParents.parentEdges?.[0];
            currentId = firstParentEdge?.parentId ?? null;
          } else {
            break;
          }
        }
      }

      return {
        ...branch,
        snapshotHistory,
      };
    }),

  /**
   * Get a branch by name within a project
   */
  getByName: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const branch = await ctx.db.query.branches.findFirst({
        where: and(eq(branches.projectId, input.projectId), eq(branches.name, input.name)),
        with: {
          snapshot: true,
        },
      });

      if (!branch) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Branch not found",
        });
      }

      return branch;
    }),

  /**
   * Get the main branch for a project
   */
  getMain: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const branch = await ctx.db.query.branches.findFirst({
        where: and(eq(branches.projectId, input.projectId), eq(branches.name, "main")),
        with: {
          snapshot: true,
          chats: {
            orderBy: (chats, { desc }) => [desc(chats.createdAt)],
            limit: 10,
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
                },
              },
            },
          },
        },
      });

      if (!branch) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Main branch not found",
        });
      }

      return branch;
    }),

  /**
   * Create a new branch (fork from another branch or snapshot)
   */
  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1).max(100),
        fromSnapshotId: z.string().optional(),
        fromBranchName: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if branch name already exists
      const existingBranch = await ctx.db.query.branches.findFirst({
        where: and(eq(branches.projectId, input.projectId), eq(branches.name, input.name)),
      });

      if (existingBranch) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Branch name already exists",
        });
      }

      let snapshotId = input.fromSnapshotId;

      // If forking from branch, get its current snapshot
      if (input.fromBranchName && !snapshotId) {
        const sourceBranch = await ctx.db.query.branches.findFirst({
          where: and(
            eq(branches.projectId, input.projectId),
            eq(branches.name, input.fromBranchName),
          ),
        });

        if (!sourceBranch) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Branch '${input.fromBranchName}' not found`,
          });
        }

        snapshotId = sourceBranch.snapshotId ?? undefined;
      }

      const branchId = nanoid();
      const [branch] = await ctx.db
        .insert(branches)
        .values({
          id: branchId,
          projectId: input.projectId,
          name: input.name,
          snapshotId: snapshotId ?? null,
          createdBy: ctx.session.user.id,
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

  /**
   * Move branch to a different snapshot
   */
  move: protectedProcedure
    .input(
      z.object({
        branchId: z.string(),
        snapshotId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the snapshot exists
      const snapshot = await ctx.db.query.snapshots.findFirst({
        where: eq(snapshots.id, input.snapshotId),
      });

      if (!snapshot) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Snapshot not found",
        });
      }

      await ctx.db
        .update(branches)
        .set({
          snapshotId: input.snapshotId,
          updatedAt: new Date(),
        })
        .where(eq(branches.id, input.branchId));

      return { success: true };
    }),

  /**
   * Advance branch (create snapshot and move branch to it)
   */
  advance: protectedProcedure
    .input(
      z.object({
        branchId: z.string(),
        commitSha: z.string(),
        title: z.string(),
        description: z.string().optional(),
        metrics: z
          .object({
            inputTokens: z.number(),
            outputTokens: z.number(),
            totalCost: z.number(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const branch = await ctx.db.query.branches.findFirst({
        where: eq(branches.id, input.branchId),
      });

      if (!branch) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Branch not found",
        });
      }

      const snapshotId = nanoid();

      await ctx.db.transaction(async (tx) => {
        // Create new snapshot
        await tx.insert(snapshots).values({
          id: snapshotId,
          projectId: branch.projectId,
          commitSha: input.commitSha,
          title: input.title,
          description: input.description,
          inputTokens: input.metrics?.inputTokens ?? 0,
          outputTokens: input.metrics?.outputTokens ?? 0,
          totalCost: input.metrics?.totalCost ?? 0,
          createdBy: ctx.session.user.id,
        });

        // Link to parent (current snapshot)
        if (branch.snapshotId) {
          await tx.insert(snapshotParents).values({
            snapshotId,
            parentId: branch.snapshotId,
          });
        }

        // Move branch
        await tx
          .update(branches)
          .set({
            snapshotId,
            updatedAt: new Date(),
          })
          .where(eq(branches.id, input.branchId));
      });

      return { snapshotId };
    }),

  /**
   * Merge multiple branches into target
   */
  merge: protectedProcedure
    .input(
      z.object({
        targetBranchId: z.string(),
        sourceBranchIds: z.array(z.string()),
        commitSha: z.string(),
        title: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Get all source snapshots
      const sourceBranches = await ctx.db.query.branches.findMany({
        where: inArray(branches.id, input.sourceBranchIds),
      });

      const parentIds: string[] = sourceBranches
        .map((b) => b.snapshotId)
        .filter((id): id is string => id !== null);

      // Get target branch's current snapshot too
      const targetBranch = await ctx.db.query.branches.findFirst({
        where: eq(branches.id, input.targetBranchId),
      });

      if (!targetBranch) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Target branch not found",
        });
      }

      if (targetBranch.snapshotId) {
        parentIds.push(targetBranch.snapshotId);
      }

      const snapshotId = nanoid();

      await ctx.db.transaction(async (tx) => {
        // Create merge snapshot
        await tx.insert(snapshots).values({
          id: snapshotId,
          projectId: targetBranch.projectId,
          commitSha: input.commitSha,
          title: input.title,
          createdBy: ctx.session.user.id,
        });

        // Link to all parents
        if (parentIds.length > 0) {
          await tx.insert(snapshotParents).values(
            parentIds.map((parentId) => ({
              snapshotId,
              parentId,
            })),
          );
        }

        // Move target branch to merge snapshot
        await tx
          .update(branches)
          .set({
            snapshotId,
            updatedAt: new Date(),
          })
          .where(eq(branches.id, input.targetBranchId));
      });

      return { snapshotId };
    }),

  /**
   * Delete branch (not the snapshots - they're immutable)
   */
  delete: protectedProcedure
    .input(z.object({ branchId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const branch = await ctx.db.query.branches.findFirst({
        where: eq(branches.id, input.branchId),
      });

      if (!branch) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Branch not found",
        });
      }

      // Don't allow deleting "main"
      if (branch.name === "main") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot delete main branch",
        });
      }

      await ctx.db.delete(branches).where(eq(branches.id, input.branchId));

      return { success: true };
    }),
};
