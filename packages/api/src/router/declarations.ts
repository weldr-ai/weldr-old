import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { and, eq } from "@weldr/db";
import { declarations } from "@weldr/db/schema";

import { protectedProcedure } from "../init";

export const declarationsRouter = {
  byId: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const declaration = await ctx.db.query.declarations.findFirst({
      where: and(eq(declarations.id, input.id), eq(declarations.userId, ctx.session.user.id)),
      columns: {
        id: true,
        nodeId: true,
        metadata: true,
        progress: true,
      },
      with: {
        node: {
          columns: {
            userId: false,
          },
        },
      },
    });

    if (!declaration) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Declaration not found",
      });
    }

    return declaration;
  }),
};
