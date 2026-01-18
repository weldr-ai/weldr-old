import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import { getLogger } from "@orpc/experimental-pino";
import * as Sentry from "@sentry/bun";

import { base } from "../lib/context";

function getClientInfo(headers: Headers) {
  return {
    userAgent: headers.get("user-agent") ?? undefined,
    ip:
      headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headers.get("x-real-ip") ??
      undefined,
    origin: headers.get("origin") ?? undefined,
    referer: headers.get("referer") ?? undefined,
  };
}

export const useSentry = base.middleware(async ({ context: ctx, next, path }) => {
  const span = trace.getSpan(context.active());
  const traceId = span?.spanContext().traceId;

  const pathStr = Array.isArray(path) ? path.join("/") : String(path);
  const client = getClientInfo(ctx.reqHeaders ?? new Headers());

  const logger = getLogger(ctx);
  const requestId = (logger?.bindings().id as string | undefined) ?? "unknown";

  if (span) {
    span.setAttribute("request.id", requestId);
    span.setAttribute("api.path", pathStr);
    if (client.ip) span.setAttribute("client.address", client.ip);
    if (client.userAgent) span.setAttribute("user_agent.original", client.userAgent);
  }

  Sentry.setTag("api.path", pathStr);
  Sentry.setTag("request_id", requestId);
  if (traceId) {
    Sentry.setTag("trace_id", traceId);
  }
  Sentry.setContext("request", {
    id: requestId,
    path: pathStr,
  });
  Sentry.setContext("client", client);

  if (ctx.user) {
    Sentry.setUser({
      id: ctx.user.id,
      email: ctx.user.email,
      ip_address: client.ip,
    });
  }

  try {
    return await next();
  } catch (error) {
    if (span) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      if (error instanceof Error) {
        span.recordException(error);
      }
    }

    logger?.error({ err: error, path: pathStr, client }, "Request failed");

    Sentry.captureException(error, {
      tags: {
        path: pathStr,
        request_id: requestId,
      },
      extra: { trace_id: traceId },
    });

    throw error;
  }
});
