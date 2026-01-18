import { getLogger } from "@orpc/experimental-pino";
import { type Route, ORPCError } from "@orpc/server";
import { z } from "zod";

import { and, eq } from "@weldr/db";
import { projects } from "@weldr/db/schema";
import { Fly } from "@weldr/shared/fly";
import { Tigris } from "@weldr/shared/tigris";

import { protectedProcedure } from "../../lib/procedures";
import { isLocalMode } from "../../lib/utils";
import { useDb } from "../../middlewares/db";

const definition = {
  method: "DELETE",
  tags: ["Projects"],
  path: "/projects/:id",
  successStatus: 200,
  description: "Delete project",
  summary: "Delete project",
} satisfies Route;

const inputSchema = z.object({
  id: z.string(),
});

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const logger = getLogger(context);
    const userId = context.user.id;

    logger?.info({ projectId: input.id, userId }, "Deleting project");

    try {
      const project = await context.db.query.projects.findFirst({
        where: and(eq(projects.id, input.id), eq(projects.userId, userId)),
      });

      if (!project) {
        throw new ORPCError("NOT_FOUND", { message: "Project not found" });
      }

      if (!isLocalMode()) {
        await Promise.all([
          Fly.app.destroy({
            type: "development",
            projectId: project.id,
          }),
          Fly.app.destroy({
            type: "preview",
            projectId: project.id,
          }),
          Fly.app.destroy({
            type: "production",
            projectId: project.id,
          }),
          Tigris.bucket.delete(`project-${project.id}`),
          Tigris.credentials.delete(project.id),
        ]);
      }

      await context.db
        .delete(projects)
        .where(and(eq(projects.id, input.id), eq(projects.userId, userId)));
    } catch (error) {
      logger?.error({ error, projectId: input.id, userId }, "Failed to delete project");
      if (error instanceof ORPCError) {
        throw error;
      }
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to delete project" });
    }
  });
