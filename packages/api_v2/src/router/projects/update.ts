import { getLogger } from "@orpc/experimental-pino";
import { type Route, ORPCError } from "@orpc/server";

import { and, eq } from "@weldr/db";
import { projects } from "@weldr/db/schema";
import { updateProjectSchema } from "@weldr/shared/validators/projects";

import { protectedProcedure } from "@/lib/procedures";
import { useDb } from "@/middlewares/db";

const definition = {
  method: "PUT",
  tags: ["Projects"],
  path: "/projects/:id",
  successStatus: 200,
  description: "Update project",
  summary: "Update project",
} satisfies Route;

export default protectedProcedure
  .route(definition)
  .input(updateProjectSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const logger = getLogger(context);
    const userId = context.user.id;

    logger?.info({ projectId: input.where.id, userId }, "Updating project");

    try {
      const result = await context.db
        .update(projects)
        .set(input.payload)
        .where(and(eq(projects.id, input.where.id), eq(projects.userId, userId)))
        .returning()
        .then(([project]) => project);

      if (!result) {
        throw new ORPCError("NOT_FOUND", { message: "Project not found" });
      }

      return result;
    } catch (error) {
      logger?.error({ error, projectId: input.where.id, userId }, "Failed to update project");
      if (error instanceof ORPCError) {
        throw error;
      }
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to update project" });
    }
  });
