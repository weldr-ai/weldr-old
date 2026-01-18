import { getLogger } from "@orpc/experimental-pino";
import { type Route, ORPCError } from "@orpc/server";
import { z } from "zod";

import { and, eq } from "@weldr/db";
import { projects } from "@weldr/db/schema";

import { protectedProcedure } from "../../lib/procedures";
import { useDb } from "../../middlewares/db";

const definition = {
  method: "GET",
  tags: ["Projects"],
  path: "/projects/:id",
  successStatus: 200,
  description: "Get project by ID",
  summary: "Get project",
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

    logger?.info({ projectId: input.id, userId }, "Getting project");

    try {
      const project = await context.db.query.projects.findFirst({
        where: and(eq(projects.id, input.id), eq(projects.userId, userId)),
        with: {
          integrations: {
            columns: {
              id: true,
              name: true,
              key: true,
            },
            with: {
              environmentVariableMappings: {
                columns: {
                  environmentVariableId: true,
                  mapTo: true,
                },
              },
              integrationTemplate: {
                columns: {
                  id: true,
                  name: true,
                  description: true,
                  key: true,
                  isRecommended: true,
                  version: true,
                  variables: true,
                  options: true,
                  recommendedOptions: true,
                },
                with: {
                  category: true,
                },
              },
            },
          },
          environmentVariables: {
            columns: {
              secretId: false,
            },
          },
        },
      });

      if (!project) {
        throw new ORPCError("NOT_FOUND", { message: "Project not found" });
      }

      return project;
    } catch (error) {
      logger?.error({ error, projectId: input.id, userId }, "Failed to get project");
      if (error instanceof ORPCError) {
        throw error;
      }
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to get project" });
    }
  });
