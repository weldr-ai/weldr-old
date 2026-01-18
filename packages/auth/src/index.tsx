import { stripe } from "@better-auth/stripe";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin, oAuthProxy, openAPI, organization } from "better-auth/plugins";
import { Resend } from "resend";
import { Stripe } from "stripe";

import { db } from "@weldr/db";
import { ResetPasswordEmail } from "@weldr/emails/reset-password";
import { VerificationEmail } from "@weldr/emails/verification-email";
import { nanoid } from "@weldr/shared/nanoid";

const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2025-10-29.clover",
});

const resend = new Resend(process.env.RESEND_API_KEY ?? "");

export const auth = betterAuth({
  baseURL: process.env.API_URL,
  advanced: {
    database: {
      generateId: () => nanoid(),
    },
    cookiePrefix: "weldr",
  },
  trustedOrigins: process.env.CORS_ORIGIN?.split(",") ?? [],
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
  }),
  emailVerification: {
    async sendVerificationEmail({ user, url }) {
      await resend.emails.send({
        from: "Weldr <noreply@weldr.ai>",
        to: user.email,
        subject: "Verify your email address",
        react: (
          <VerificationEmail
            verificationLink={url}
            firstName={user.name.split(" ")[0] ?? user.email}
          />
        ),
      });
    },
    sendOnSignUp: true,
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    async sendResetPassword({ user, url }, _request) {
      await resend.emails.send({
        from: "Weldr <noreply@weldr.ai>",
        to: user.email,
        subject: "Reset your password",
        react: (
          <ResetPasswordEmail
            firstName={user.name.split(" ")[0] ?? user.email}
            resetPasswordLink={url}
          />
        ),
      });
    },
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
    // microsoft: {
    //   clientId: process.env.MICROSOFT_CLIENT_ID as string,
    //   clientSecret: process.env.MICROSOFT_CLIENT_SECRET as string,
    // },
  },
  plugins: [
    oAuthProxy(),
    nextCookies(),
    admin(),
    openAPI(),
    organization(),
    stripe({
      stripeClient,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET as string,
      createCustomerOnSignUp: true,
      subscription: {
        enabled: true,
        plans: [
          {
            name: "pro",
            priceId: "price_1RLJHkRK2VN7oq4xQzgKTrCy",
            limits: {
              credits: 100,
            },
          },
        ],
      },
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
export type Subscription = {
  limits: Record<string, unknown> | undefined;
  id: string;
  plan: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  trialStart?: Date;
  trialEnd?: Date;
  priceId?: string;
  referenceId: string;
  status:
    | "active"
    | "canceled"
    | "incomplete"
    | "incomplete_expired"
    | "past_due"
    | "paused"
    | "trialing"
    | "unpaid";
  periodStart?: Date;
  periodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  groupId?: string;
  seats?: number;
};
