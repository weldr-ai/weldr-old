import { createHandlers } from "@weldr/api";

import { env } from "./env";
import { logger } from "./logger";

const { openApiHandler, rpcHandler, corsConfig } = createHandlers({
  corsOrigin: env.CORS_ORIGIN,
  apiUrl: env.API_URL,
  port: env.PORT,
  isDevelopment: env.NODE_ENV === "development",
  logger,
});

export { openApiHandler, rpcHandler, corsConfig };
