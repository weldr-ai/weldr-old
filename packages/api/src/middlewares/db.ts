import { db } from "@weldr/db";

import { base } from "../lib/context";

export const useDb = base.middleware(async ({ context, next }) => {
  return next({
    context: {
      db: context.db ?? db,
    },
  });
});
