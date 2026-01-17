import { getLogger } from "@orpc/experimental-pino";
import type { Route } from "@orpc/server";
import { z } from "zod";

import { db, sql } from "@weldr/db";

import { publicProcedure } from "@/lib/procedures";

const definition = {
  method: "GET",
  tags: ["Health"],
  path: "/ready",
  successStatus: 200,
  description: "Readiness check endpoint",
  summary: "Readiness check",
} satisfies Route;

const outputSchema = z.object({
  status: z.enum(["ready", "not_ready"]),
  timestamp: z.date(),
});

export default publicProcedure
  .route(definition)
  .output(outputSchema)
  .handler(async ({ context }) => {
    const logger = getLogger(context);

    let isReady = false;

    try {
      await db.execute(sql`SELECT 1`);
      isReady = true;
    } catch {
      logger?.error("Database is not ready");
      isReady = false;
    }

    return {
      status: isReady ? "ready" : "not_ready",
      timestamp: new Date(),
    };
  });
