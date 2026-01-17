import { pinoLogger } from "hono-pino";

import { Logger } from "@weldr/shared/logger";

export function loggerMiddleware() {
  return pinoLogger({
    pino: Logger.instance,
  });
}
