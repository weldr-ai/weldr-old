import { type Route, ORPCError } from "@orpc/server";
import { z } from "zod";

import { and, eq, sql, type db as dbType } from "@weldr/db";
import { snapshots } from "@weldr/db/schema";

import { protectedProcedure } from "@/lib/procedures";
import { useDb } from "@/middlewares/db";

const definition = {
  method: "GET",
  tags: ["Snapshots"],
  path: "/snapshots/:id/history",
  successStatus: 200,
  description: "Get snapshot history (ancestors)",
  summary: "Get snapshot history",
} satisfies Route;

const inputSchema = z.object({
  id: z.string(),
  limit: z.number().default(50),
});

async function getSnapshotAncestors(db: typeof dbType, snapshotId: string, limit: number) {
  const result = await db.execute(sql`
    WITH RECURSIVE ancestors AS (
      SELECT s.*, 0 as depth
      FROM snapshots s
      WHERE s.id = ${snapshotId}

      UNION ALL

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

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const snapshot = await context.db.query.snapshots.findFirst({
      where: and(eq(snapshots.id, input.id), eq(snapshots.userId, context.user.id)),
    });

    if (!snapshot) {
      throw new ORPCError("NOT_FOUND", { message: "Snapshot not found" });
    }

    return getSnapshotAncestors(context.db, input.id, input.limit);
  });
