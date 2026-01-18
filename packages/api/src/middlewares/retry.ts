import { trace } from "@opentelemetry/api";

import { base } from "../lib/context";

export interface RetryOptions {
  /** Maximum number of attempts (must be >= 1) */
  maxAttempts: number;
}

export function retry(options: RetryOptions) {
  const { maxAttempts } = options;

  const middleware = base.middleware(async ({ context, next }) => {
    // Already inside a retry loop - don't nest retries
    if (context.retry?.canRetry === false) {
      return next();
    }

    const span = trace.getActiveSpan();
    span?.setAttribute("retry.maxAttempts", maxAttempts);

    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxAttempts) {
      attempt++;
      const isRetry = attempt > 1;

      span?.setAttribute("retry.attempt", attempt);
      span?.setAttribute("retry.isRetry", isRetry);

      try {
        return await next({
          context: {
            retry: {
              attempt,
              maxAttempts,
              canRetry: false,
              isRetry,
            },
          },
        });
      } catch (e) {
        lastError = e;

        if (attempt < maxAttempts) {
          span?.addEvent("retry.attemptFailed", {
            attempt,
            error: String(e),
            remainingAttempts: maxAttempts - attempt,
          });
        }
      }
    }

    span?.addEvent("retry.exhausted", {
      totalAttempts: attempt,
      error: String(lastError),
    });

    throw lastError;
  });

  Object.defineProperty(middleware, "name", {
    value: "retry",
  });

  return middleware;
}
