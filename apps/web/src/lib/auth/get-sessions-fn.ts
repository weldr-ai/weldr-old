import * as Sentry from "@sentry/tanstackstart-react";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { auth, type Session } from "@weldr/auth";

export const getSessionsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { session: Session | null }) => input)
  .handler(async ({ data }) => {
    if (!data.session) {
      return null;
    }

    return Sentry.startSpan({ name: "getSessions", op: "auth.sessions" }, async () => {
      try {
        const sessions = await auth.api.listSessions({
          headers: getRequestHeaders(),
        });
        return sessions;
      } catch (error) {
        Sentry.captureException(error, {
          tags: { "server-function": "getSessionsFn" },
        });
        throw error;
      }
    });
  });
