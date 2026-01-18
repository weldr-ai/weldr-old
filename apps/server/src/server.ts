import { fetch } from ".";
import { env } from "./lib/env";
import { logger } from "./lib/logger";

logger.info(`Starting server on port ${env.PORT}...`);

Bun.serve({
  port: parseInt(env.PORT, 10),
  development: env.NODE_ENV === "development",
  fetch,
});

logger.info("Server started");
logger.info(`Server: http://localhost:${env.PORT}`);
logger.info(`API Reference: http://localhost:${env.PORT}/api/reference`);
