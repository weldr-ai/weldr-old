import { SpanStatusCode, trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor, TraceIdRatioBasedSampler } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { ORPCInstrumentation } from "@orpc/otel";
import * as Sentry from "@sentry/bun";

import { env } from "./src/lib/env";

// =============================================================================
// OpenTelemetry SDK Setup (per Axiom docs)
// https://axiom.co/docs/guides/opentelemetry-nodejs
// =============================================================================

// Resource attributes (metadata about this service)
const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: env.OTEL_SERVICE_NAME,
  [ATTR_SERVICE_VERSION]: env.OTEL_SERVICE_VERSION,
  "deployment.environment": env.NODE_ENV,
});

// Trace exporter using Protocol Buffers (recommended by Axiom)
const traceExporter = new OTLPTraceExporter({
  url: `${env.AXIOM_ENDPOINT}/v1/traces`,
  headers: {
    Authorization: `Bearer ${env.AXIOM_TOKEN}`,
    "X-Axiom-Dataset": env.AXIOM_DATASET,
  },
});

// Initialize OpenTelemetry SDK
const sdk = new NodeSDK({
  resource,
  // Use BatchSpanProcessor for efficient batching before export
  spanProcessor: new BatchSpanProcessor(traceExporter),
  instrumentations: [new ORPCInstrumentation()],
  // Use proper OTEL sampler for trace sampling
  // Sampling: 100% in dev, 10% in production (adjust as needed)
  sampler: new TraceIdRatioBasedSampler(env.NODE_ENV === "production" ? 0.1 : 1.0),
});

// Start the SDK
sdk.start();

console.log(`[OTEL] OpenTelemetry initialized for ${env.OTEL_SERVICE_NAME}`);
console.log(`[OTEL] Exporting traces to Axiom dataset: ${env.AXIOM_DATASET}`);

// =============================================================================
// Uncaught Error Handling
// =============================================================================

const tracer = trace.getTracer("uncaught-errors");

function recordError(eventName: string, reason: unknown): void {
  const span = tracer.startSpan(eventName);
  const message = String(reason);

  if (reason instanceof Error) {
    span.recordException(reason);
  } else {
    span.recordException({ message });
  }

  span.setStatus({ code: SpanStatusCode.ERROR, message });
  span.end();

  // Also send to Sentry
  Sentry.captureException(reason, {
    tags: { type: eventName },
  });
}

process.on("uncaughtException", (reason: Error) => {
  console.error("[ERROR] Uncaught exception:", reason);
  recordError("uncaughtException", reason);
});

process.on("unhandledRejection", (reason: unknown) => {
  console.error("[ERROR] Unhandled rejection:", reason);
  recordError("unhandledRejection", reason);
});

// =============================================================================
// Graceful Shutdown
// =============================================================================

async function shutdown(): Promise<void> {
  console.log("[SHUTDOWN] Graceful shutdown initiated...");

  try {
    // Flush all pending telemetry
    await sdk.shutdown();
    console.log("[SHUTDOWN] OpenTelemetry shutdown complete");

    // Flush Sentry
    await Sentry.close(2000);
    console.log("[SHUTDOWN] Sentry shutdown complete");
  } catch (error) {
    console.error("[SHUTDOWN] Error during shutdown:", error);
  }

  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// =============================================================================
// Sentry Initialization
// =============================================================================

Sentry.init({
  dsn: env.SENTRY_DSN,
  environment: env.NODE_ENV,
  release: env.OTEL_SERVICE_VERSION,

  // Send default PII (adjust based on privacy requirements)
  sendDefaultPii: true,

  // Trace sampling (match OTEL sampling)
  tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1.0,
});

console.log(`[SENTRY] Sentry initialized for ${env.NODE_ENV}`);
