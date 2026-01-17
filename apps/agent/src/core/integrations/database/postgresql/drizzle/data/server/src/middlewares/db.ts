import { db } from "@repo/server/db";
import { base } from "@repo/server/lib/utils";

export const useDb = base.middleware(async ({ context, next }) => {
  return next({
    context: {
      db: context.db ?? db,
    },
  });
});
