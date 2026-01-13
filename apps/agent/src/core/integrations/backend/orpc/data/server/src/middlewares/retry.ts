import { base } from "@repo/server/lib/utils";

export function retry(options: { times: number }) {
  return base
    .$context<{ canRetry?: boolean }>()
    .middleware(({ context, next }) => {
      const canRetry = context.canRetry ?? true;

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
}
