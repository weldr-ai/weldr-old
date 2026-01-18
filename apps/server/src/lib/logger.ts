import { context, trace } from "@opentelemetry/api";
import pino, { type Logger, type LoggerOptions } from "pino";

import { env } from "./env";

const isDevelopment = env.NODE_ENV === "development";

const mixin = (): Record<string, string> => {
  const span = trace.getSpan(context.active());
  if (span) {
    const spanContext = span.spanContext();
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
    };
  }
  return {};
};

const baseOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  mixin,
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: env.OTEL_SERVICE_NAME,
    version: env.OTEL_SERVICE_VERSION,
    env: env.NODE_ENV,
  },
};

let logger: Logger;

if (isDevelopment) {
  logger = pino({
    ...baseOptions,
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        singleLine: false,
        translateTime: "HH:MM:ss",
        ignore: "pid,hostname",
      },
    },
  });
} else {
  logger = pino({
    ...baseOptions,
    transport: {
      targets: [
        // Stdout for Cloud Run log aggregation
        { target: "pino/file", options: { destination: 1 } },
        // Axiom transport for log analytics
        {
          target: "@axiomhq/pino",
          options: {
            dataset: env.AXIOM_DATASET,
            token: env.AXIOM_TOKEN,
          },
        },
      ],
    },
  });
}

export { logger };
