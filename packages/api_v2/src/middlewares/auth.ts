import { ORPCError } from "@orpc/server";

import { auth } from "@weldr/auth";

import { base } from "@/lib/context";

export const useAuth = base.middleware(async ({ context, next }) => {
  const data = context.session
    ? {
        session: context.session,
        user: context.user,
      }
    : await auth.api.getSession({
        headers: context.reqHeaders ?? new Headers(),
      });

  if (!data?.session || !data?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }

  return next({
    context: {
      session: data.session,
      user: data.user,
    },
  });
});
