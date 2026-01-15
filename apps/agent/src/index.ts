import { serve } from "@hono/node-server";
import type { Context } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";

import { Logger } from "@weldr/shared/logger";

import { recoverEnrichingJobs } from "./core/project/declarations/enriching-jobs";
import { closeDurableStreams, initDurableStreams } from "./core/stream";
import { loggerMiddleware } from "./http/middlewares/logger";
import { routes } from "./http/routes";
import { configureOpenAPI, createRouter } from "./http/utils";
import { recoverSessions, sessionRegistry } from "./session";

export const app = createRouter();

app
  .use(requestId())
  .use(loggerMiddleware())
  .use(
    cors({
      origin: process.env.CORS_ORIGIN?.split(",") ?? "http://localhost:3000",
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      exposeHeaders: ["Content-Type", "Authorization"],
      maxAge: 600,
      credentials: true,
    }),
  );

configureOpenAPI(app);

for (const route of routes) {
  app.route("/", route);
}

app.use("*", async (c: Context) => {
  return c.json(
    {
      message: "Not found",
    },
    404,
  );
});

app.onError((err: Error, c: Context) => {
  console.error(err);
  return c.json(
    {
      message: "Internal server error",
    },
    500,
  );
});

const port = process.env.PORT ? Number.parseInt(process.env.PORT) : 8080;

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  Logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    // Stop all active session actors
    sessionRegistry.shutdown();

    // Close Durable Streams server
    await closeDurableStreams();
  } catch (error) {
    Logger.error("Error during graceful shutdown", {
      extra: { error: error instanceof Error ? error.message : String(error) },
    });
  }

  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Only start server when run directly (not when imported by tests)
if (import.meta.main) {
  serve(
    {
      fetch: app.fetch,
      port,
    },
    async (info) => {
      Logger.info(`Server is running on http://localhost:${info.port}`);

      // Initialize Durable Streams server
      await initDurableStreams();

      await recoverSessions();
      await recoverEnrichingJobs();
    },
  );
}
