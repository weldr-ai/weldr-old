import type { Route } from "@orpc/server";

import { protectedProcedure } from "@/lib/procedures";
import { useDb } from "@/middlewares/db";

const definition = {
  method: "GET",
  tags: ["Integration Templates"],
  path: "/integration-templates",
  successStatus: 200,
  description: "List all integration templates",
  summary: "List integration templates",
} satisfies Route;

export default protectedProcedure
  .route(definition)
  .use(useDb)
  .handler(async ({ context }) => {
    return context.db.query.integrationTemplates.findMany({
      columns: {
        id: true,
        name: true,
        description: true,
        key: true,
        version: true,
        variables: true,
        options: true,
        recommendedOptions: true,
        isRecommended: true,
      },
      with: {
        category: {
          columns: {
            id: true,
            key: true,
            description: true,
            priority: true,
            recommendedIntegrations: true,
            dependencies: true,
          },
        },
      },
      orderBy: (templates, { asc }) => [asc(templates.key)],
    });
  });
