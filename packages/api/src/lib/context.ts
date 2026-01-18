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
  /** User session */
  session?: typeof auth.$Infer.Session.session | null;
  /** User */
  user?: typeof auth.$Infer.Session.user | null;
  /** Database */
  db?: typeof db;
  /** Retry context */
  retry?: {
    /** Current attempt number (1-indexed) */
    attempt: number;
    /** Maximum retry attempts configured */
    maxAttempts: number;
    /** Whether this call can be retried (false when inside retry loop) */
    canRetry: boolean;
    /** Whether this is a retry attempt (not the first call) */
    isRetry: boolean;
  };
}

export const base = os.$context<ORPCContext>();
