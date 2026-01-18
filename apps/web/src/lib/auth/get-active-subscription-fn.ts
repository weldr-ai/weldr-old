import type { Subscription } from "@better-auth/stripe";
import * as Sentry from "@sentry/tanstackstart-react";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { auth, type Session } from "@weldr/auth";

export const getActiveSubscriptionFn = createServerFn({ method: "POST" })
  .inputValidator((input: { session: Session | null }) => input)
  .handler(async ({ data }) => {
    if (!data.session) {
      return null;
    }

    return Sentry.startSpan(
      { name: "getActiveSubscription", op: "auth.activeSubscription" },
      async () => {
        try {
          const subscriptions = await auth.api.listActiveSubscriptions({
            headers: getRequestHeaders(),
          });

          const activeSubscription =
            subscriptions?.find(
              (subscription) =>
                subscription.status === "active" || subscription.status === "trialing",
            ) ?? null;

          return activeSubscription as Subscription | null;
        } catch (error) {
          Sentry.captureException(error, {
            tags: { "server-function": "getActiveSubscriptionFn" },
          });
          throw error;
        }
      },
    );
  });
