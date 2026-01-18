import { type Route, ORPCError } from "@orpc/server";
import { z } from "zod";

import { and, eq } from "@weldr/db";
import { branches, snapshots } from "@weldr/db/schema";

import { protectedProcedure } from "../../lib/procedures";
import { useDb } from "../../middlewares/db";

const definition = {
  method: "GET",
  tags: ["Branches"],
  path: "/branches/by-id-or-main",
  successStatus: 200,
  description: "Get branch by ID or fall back to main branch with snapshot history",
  summary: "Get branch by ID or main",
} satisfies Route;

const inputSchema = z.object({
  id: z.string().optional(),
  projectId: z.string(),
  snapshotId: z.string().optional(),
});

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    let branch;

    if (input.id) {
      branch = await context.db.query.branches.findFirst({
        where: and(
          eq(branches.id, input.id),
          eq(branches.projectId, input.projectId),
          eq(branches.userId, context.user.id),
        ),
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
      branch = await context.db.query.branches.findFirst({
        where: and(
          eq(branches.projectId, input.projectId),
          eq(branches.name, "main"),
          eq(branches.userId, context.user.id),
        ),
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
      throw new ORPCError("NOT_FOUND", { message: "Branch not found" });
    }

    const snapshotHistory: (typeof snapshots.$inferSelect)[] = [];
    if (branch.snapshot) {
      let currentId: string | null = branch.snapshot.id;
      const visited = new Set<string>();

      while (currentId && !visited.has(currentId) && snapshotHistory.length < 50) {
        visited.add(currentId);

        const snapshotWithParents:
          | (typeof snapshots.$inferSelect & {
              parentEdges?: { snapshotId: string; parentId: string }[];
            })
          | undefined = await context.db.query.snapshots.findFirst({
          where: eq(snapshots.id, currentId),
          with: {
            parentEdges: true,
          },
        });

        if (snapshotWithParents) {
          snapshotHistory.push(snapshotWithParents);
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
  });
