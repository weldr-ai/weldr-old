import type { ResponseHeadersPluginContext } from "@orpc/server/plugins";
import type { Logger } from "pino";

export interface ORPCContext extends ResponseHeadersPluginContext {
  logger: Logger;
  headers: Headers;
}
