import { getLogger } from "@orpc/experimental-pino";
import { type Route, ORPCError } from "@orpc/server";

import { eq } from "@weldr/db";
import { projects } from "@weldr/db/schema";

import { protectedProcedure } from "../../lib/procedures";
import { useDb } from "../../middlewares/db";

const definition = {
  method: "GET",
  tags: ["Projects"],
  path: "/projects",
  successStatus: 200,
  description: "List all user projects",
  summary: "List projects",
} satisfies Route;

export default protectedProcedure
  .route(definition)
  .use(useDb)
  .handler(async ({ context }) => {
    const logger = getLogger(context);
    const userId = context.user.id;

    logger?.info({ userId }, "Listing projects");

    try {
      const result = await context.db.query.projects.findMany({
        where: eq(projects.userId, userId),
      });
      return result;
    } catch (error) {
      logger?.error({ error, userId }, "Failed to list projects");
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to list projects" });
    }
  });
