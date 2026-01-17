import { type Route, ORPCError } from "@orpc/server";
import { z } from "zod";

import { and, eq } from "@weldr/db";
import { snapshots } from "@weldr/db/schema";

import { protectedProcedure } from "@/lib/procedures";
import { useDb } from "@/middlewares/db";

const definition = {
  method: "GET",
  tags: ["Snapshots"],
  path: "/snapshots/compare",
  successStatus: 200,
  description: "Compare two snapshots (for diff view)",
  summary: "Compare snapshots",
} satisfies Route;

const inputSchema = z.object({
  fromSnapshotId: z.string(),
  toSnapshotId: z.string(),
});

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const [fromSnapshot, toSnapshot] = await Promise.all([
      context.db.query.snapshots.findFirst({
        where: and(eq(snapshots.id, input.fromSnapshotId), eq(snapshots.userId, context.user.id)),
        with: { project: true },
      }),
      context.db.query.snapshots.findFirst({
        where: and(eq(snapshots.id, input.toSnapshotId), eq(snapshots.userId, context.user.id)),
        with: { project: true },
      }),
    ]);

    if (
      !fromSnapshot ||
      !toSnapshot ||
      fromSnapshot.project.userId !== context.user.id ||
      toSnapshot.project.userId !== context.user.id
    ) {
      throw new ORPCError("NOT_FOUND", { message: "One or both snapshots not found" });
    }

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
  });
