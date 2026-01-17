import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { and, type db as dbType, desc, eq, sql } from "@weldr/db";
import { projects, snapshotParents, snapshots } from "@weldr/db/schema";
import { nanoid } from "@weldr/shared/nanoid";

import { protectedProcedure } from "../init";

/**
 * Get snapshot ancestors using a recursive CTE
 */
async function getSnapshotAncestors(db: typeof dbType, snapshotId: string, limit: number) {
  // Using a recursive CTE to traverse the DAG
  const result = await db.execute(sql`
    WITH RECURSIVE ancestors AS (
      -- Base case: the starting snapshot
      SELECT s.*, 0 as depth
      FROM snapshots s
      WHERE s.id = ${snapshotId}

      UNION ALL

      -- Recursive case: get parents
      SELECT s.*, a.depth + 1
      FROM snapshots s
      INNER JOIN snapshot_parents sp ON s.id = sp.parent_id
      INNER JOIN ancestors a ON sp.snapshot_id = a.id
      WHERE a.depth < ${limit}
    )
    SELECT DISTINCT ON (id) *
    FROM ancestors
    ORDER BY id, depth
    LIMIT ${limit}
  `);

  return result;
}

export const snapshotsRouter = {
  /**
   * Get a single snapshot by ID
   */
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const snapshot = await ctx.db.query.snapshots.findFirst({
      where: and(eq(snapshots.id, input.id), eq(snapshots.userId, ctx.session.user.id)),
      with: {
        parentEdges: {
          with: {
            parent: true,
          },
        },
        project: true,
        creator: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!snapshot) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Snapshot not found",
      });
    }

    return snapshot;
  }),

  /**
   * Get snapshot history (ancestors)
   */
  getHistory: protectedProcedure
    .input(
      z.object({
        snapshotId: z.string(),
        limit: z.number().default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const snapshot = await ctx.db.query.snapshots.findFirst({
        where: and(eq(snapshots.id, input.snapshotId), eq(snapshots.userId, ctx.session.user.id)),
      });

      if (!snapshot) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Snapshot not found",
        });
      }

      return getSnapshotAncestors(ctx.db, input.snapshotId, input.limit);
    }),

  /**
   * Create a snapshot (called by agent after work)
   */
  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        parentIds: z.array(z.string()),
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
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.session.user.id)),
        columns: { id: true },
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      const snapshotId = nanoid();

      await ctx.db.transaction(async (tx) => {
        // Create snapshot
        await tx.insert(snapshots).values({
          id: snapshotId,
          projectId: input.projectId,
          userId: ctx.session.user.id,
          commitSha: input.commitSha,
          title: input.title,
          description: input.description,
          inputTokens: input.metrics?.inputTokens ?? 0,
          outputTokens: input.metrics?.outputTokens ?? 0,
          totalCost: input.metrics?.totalCost ?? 0,
          createdBy: ctx.session.user.id,
        });

        // Create parent edges
        if (input.parentIds.length > 0) {
          await tx.insert(snapshotParents).values(
            input.parentIds.map((parentId) => ({
              snapshotId,
              parentId,
            })),
          );
        }
      });

      return { id: snapshotId };
    }),

  /**
   * Compare two snapshots (for diff view)
   */
  compare: protectedProcedure
    .input(
      z.object({
        fromSnapshotId: z.string(),
        toSnapshotId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const [fromSnapshot, toSnapshot] = await Promise.all([
        ctx.db.query.snapshots.findFirst({
          where: and(
            eq(snapshots.id, input.fromSnapshotId),
            eq(snapshots.userId, ctx.session.user.id),
          ),
          with: { project: true },
        }),
        ctx.db.query.snapshots.findFirst({
          where: and(
            eq(snapshots.id, input.toSnapshotId),
            eq(snapshots.userId, ctx.session.user.id),
          ),
          with: { project: true },
        }),
      ]);

      // Verify ownership for both snapshots
      if (
        !fromSnapshot ||
        !toSnapshot ||
        fromSnapshot.project.userId !== ctx.session.user.id ||
        toSnapshot.project.userId !== ctx.session.user.id
      ) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "One or both snapshots not found",
        });
      }

      // Return the commit SHAs for the client to use with git diff
      return {
        from: {
          id: fromSnapshot.id,
          commitSha: fromSnapshot.commitSha,
          title: fromSnapshot.title,
        },
        to: {
          id: toSnapshot.id,
          commitSha: toSnapshot.commitSha,
          title: toSnapshot.title,
        },
      };
    }),

  /**
   * List snapshots for a project
   */
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.query.snapshots.findMany({
        where: and(
          eq(snapshots.projectId, input.projectId),
          eq(snapshots.userId, ctx.session.user.id),
        ),
        orderBy: [desc(snapshots.createdAt)],
        limit: input.limit,
        offset: input.offset,
        with: {
          parentEdges: {
            with: {
              parent: {
                columns: {
                  id: true,
                  title: true,
                },
              },
            },
          },
        },
      });
    }),
};
