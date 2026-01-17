import { type Route, ORPCError } from "@orpc/server";
import { z } from "zod";

import { and, eq } from "@weldr/db";
import { branches } from "@weldr/db/schema";

import { protectedProcedure } from "@/lib/procedures";
import { useDb } from "@/middlewares/db";

const definition = {
  method: "GET",
  tags: ["Branches"],
  path: "/branches/main",
  successStatus: 200,
  description: "Get the main branch for a project",
  summary: "Get main branch",
} satisfies Route;

const inputSchema = z.object({
  projectId: z.string(),
});

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const branch = await context.db.query.branches.findFirst({
      where: and(
        eq(branches.projectId, input.projectId),
        eq(branches.name, "main"),
        eq(branches.userId, context.user.id),
      ),
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
      throw new ORPCError("NOT_FOUND", { message: "Main branch not found" });
    }

    return branch;
  });
