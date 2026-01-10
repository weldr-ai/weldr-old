import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";

import { Logger } from "@weldr/shared/logger";
import { initializeWorkspace } from "@weldr/shared/state";

import { recoverEnrichingJobs } from "./ai/utils/enriching-jobs";
import { closeRedisConnections } from "./lib/stream-utils";
import { configureOpenAPI, createRouter } from "./lib/utils";
import { loggerMiddleware } from "./middlewares/logger";
import { routes } from "./routes";
import { recoverSessions } from "./session";

const app = createRouter();

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

app.use("*", async (c) => {
  return c.json(
    {
      message: "Not found",
    },
    404,
  );
});

app.onError((err, c) => {
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
    // Close Redis connections
    await closeRedisConnections();
  } catch (error) {
    Logger.error("Error during graceful shutdown", {
      extra: { error: error instanceof Error ? error.message : String(error) },
    });
  }

  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

serve(
  {
    fetch: app.fetch,
    port,
  },
  async (info) => {
    Logger.info(`Server is running on http://localhost:${info.port}`);
    await initializeWorkspace();
    await recoverSessions();
    await recoverEnrichingJobs();
  },
);
