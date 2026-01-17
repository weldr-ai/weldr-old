import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { and, eq, inArray } from "@weldr/db";
import { nodes } from "@weldr/db/schema";

import { protectedProcedure } from "../init";

export const nodesRouter = {
  byId: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const canvasNode = await ctx.db.query.nodes.findFirst({
      where: and(eq(nodes.id, input.id), eq(nodes.userId, ctx.session.user.id)),
    });

    if (!canvasNode) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Canvas node not found",
      });
    }

    return canvasNode;
  }),
  update: protectedProcedure
    .input(
      z.object({
        where: z.object({
          id: z.string(),
        }),
        payload: z.object({
          position: z.object({ x: z.number(), y: z.number() }),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existingNode = await ctx.db.query.nodes.findFirst({
        where: and(eq(nodes.id, input.where.id), eq(nodes.userId, ctx.session.user.id)),
      });

      if (!existingNode) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Canvas node not found",
        });
      }

      const [canvasNode] = await ctx.db
        .update(nodes)
        .set({
          position: input.payload.position,
        })
        .where(eq(nodes.id, input.where.id))
        .returning();

      return canvasNode;
    }),
  batchUpdatePositions: protectedProcedure
    .input(
      z.object({
        updates: z.array(
          z.object({
            id: z.string(),
            position: z.object({ x: z.number(), y: z.number() }),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const nodeIds = input.updates.map((u) => u.id);
      const existingNodes = await ctx.db.query.nodes.findMany({
        where: and(inArray(nodes.id, nodeIds), eq(nodes.userId, ctx.session.user.id)),
        columns: { id: true },
      });

      if (existingNodes.length !== nodeIds.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "One or more nodes not found",
        });
      }

      const results = await ctx.db.transaction(async (tx) => {
        const updatePromises = input.updates.map((update) =>
          tx
            .update(nodes)
            .set({ position: update.position })
            .where(eq(nodes.id, update.id))
            .returning(),
        );
        return await Promise.all(updatePromises);
      });

      return results;
    }),
};
