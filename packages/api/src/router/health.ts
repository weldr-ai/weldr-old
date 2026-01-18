import type { Route } from "@orpc/server";
import { z } from "zod";

import { publicProcedure } from "../lib/procedures";

const definition = {
  method: "GET",
  tags: ["Health"],
  path: "/health",
  successStatus: 200,
  description: "Health check endpoint",
  summary: "Health check",
} satisfies Route;

const outputSchema = z.object({
  status: z.literal("healthy"),
  timestamp: z.date(),
});

export default publicProcedure
  .route(definition)
  .output(outputSchema)
  .handler(async () => {
    return {
      status: "healthy",
      timestamp: new Date(),
    };
  });
