import type { LoggerContext } from "@orpc/experimental-pino";
import { os } from "@orpc/server";
import type {
  RequestHeadersPluginContext,
  ResponseHeadersPluginContext,
} from "@orpc/server/plugins";

import type { auth } from "@weldr/auth";
import type { db } from "@weldr/db";

export type HandlerType = "rpc" | "rest";

export interface ORPCContext
  extends RequestHeadersPluginContext, ResponseHeadersPluginContext, LoggerContext {
  session?: typeof auth.$Infer.Session.session | null;
  user?: typeof auth.$Infer.Session.user | null;
  db?: typeof db;
}

export const base = os.$context<ORPCContext>();
