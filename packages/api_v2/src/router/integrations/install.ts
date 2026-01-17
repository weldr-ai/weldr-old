import { getLogger } from "@orpc/experimental-pino";
import { type Route, ORPCError } from "@orpc/server";
import { z } from "zod";

import { and, eq } from "@weldr/db";
import { integrationInstallations, integrations } from "@weldr/db/schema";

import { protectedProcedure } from "@/lib/procedures";
import { callAgentProxy } from "@/lib/utils";
import { useDb } from "@/middlewares/db";

const definition = {
  method: "POST",
  tags: ["Integrations"],
  path: "/integrations/:id/install",
  successStatus: 200,
  description: "Install integration on a snapshot",
  summary: "Install integration",
} satisfies Route;

const inputSchema = z.object({
  id: z.string(),
  snapshotId: z.string(),
  branchId: z.string(),
  chatId: z.string().optional(),
  startSession: z.boolean().optional().default(false),
});

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const logger = getLogger(context);
    const userId = context.user.id;

    logger?.info(
      { integrationId: input.id, snapshotId: input.snapshotId, userId },
      "Installing integration",
    );

    await context.db.transaction(async (tx) => {
      const snapshot = await tx.query.snapshots.findFirst({
        where: (snapshots, { eq }) =>
          and(eq(snapshots.id, input.snapshotId), eq(snapshots.createdBy, userId)),
      });

      if (!snapshot) {
        throw new ORPCError("NOT_FOUND", { message: "Snapshot not found" });
      }

      const integration = await tx.query.integrations.findFirst({
        where: and(eq(integrations.id, input.id), eq(integrations.userId, userId)),
      });

      if (!integration) {
        throw new ORPCError("NOT_FOUND", { message: "Integration not found" });
      }

      const existingInstallation = await tx.query.integrationInstallations.findFirst({
        where: and(
          eq(integrationInstallations.integrationId, input.id),
          eq(integrationInstallations.snapshotId, input.snapshotId),
        ),
      });

      if (existingInstallation) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Integration already queued or installed for this snapshot",
        });
      }

      await tx.insert(integrationInstallations).values({
        integrationId: input.id,
        snapshotId: input.snapshotId,
        status: "queued",
      });

      logger?.info(
        { integrationKey: integration.key, snapshotId: input.snapshotId },
        "Queued integration for snapshot",
      );

      await callAgentProxy(
        "/integrations/install",
        {
          projectId: snapshot.projectId,
          branchId: input.branchId,
          chatId: input.chatId,
          startSession: input.startSession,
        },
        context.reqHeaders,
      );
    });

    return { success: true };
  });
