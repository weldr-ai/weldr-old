import * as Sentry from "@sentry/tanstackstart-react";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { auth } from "@weldr/auth";

export const getSessionFn = createServerFn({ method: "POST" }).handler(async () => {
  return Sentry.startSpan({ name: "getSession", op: "auth.session" }, async () => {
    try {
      const session = await auth.api.getSession({
        headers: getRequestHeaders(),
      });
      return session ?? null;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { "server-function": "getSessionFn" },
      });
      throw error;
    }
  });
});
