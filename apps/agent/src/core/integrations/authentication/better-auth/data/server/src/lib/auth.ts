import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { openAPI } from "better-auth/plugins";
import { reactStartCookies } from "better-auth/react-start";

import { db } from "@repo/server/db";
import { nanoid } from "@repo/server/lib/nanoid";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
  }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: process.env.CORS_HOST?.split(",") ?? [],
  plugins: [reactStartCookies(), openAPI()],
  advanced: {
    database: {
      generateId: () => nanoid(),
    },
  },
});

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
