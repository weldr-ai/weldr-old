import { stripeClient } from "@better-auth/stripe/client";
import {
  adminClient,
  apiKeyClient,
  organizationClient,
  lastLoginMethodClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:8080";

export const authClient = createAuthClient({
  baseURL: SERVER_URL,
  plugins: [
    adminClient(),
    stripeClient({
      subscription: true,
    }),
    lastLoginMethodClient(),
    organizationClient(),
    apiKeyClient(),
    adminClient(),
  ],
  fetchOptions: {
    credentials: "include",
  },
});
