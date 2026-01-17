import { trace } from "@opentelemetry/api";

import { base } from "@/lib/context";

export function retry(options: { times: number }) {
  const middleware = base.$context<{ canRetry?: boolean }>().middleware(({ context, next }) => {
    const canRetry = context.canRetry ?? true;

    const span = trace.getActiveSpan();
    span?.setAttribute("middleware.retry.times", options.times);
    span?.setAttribute("middleware.retry.canRetry", canRetry);

    if (!canRetry) {
      return next();
    }

    let times = 0;
    while (true) {
      try {
        return next({
          context: {
            canRetry: false,
          },
        });
      } catch (e) {
        if (times >= options.times) {
          throw e;
        }

        times++;
      }
    }
  });

  Object.defineProperty(middleware, "name", {
    value: "retry",
  });

  return middleware;
}
