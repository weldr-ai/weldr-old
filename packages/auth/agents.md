# Auth Package Development Guidelines

## Overview

The @weldr/auth package provides authentication and authorization for the Weldr platform using Better Auth. It handles user management, session handling, OAuth providers, and Stripe subscription integration.

## Type Safety Requirements

### Session Types

```typescript
// Server-side session access
import { auth, type Session, type User, type Subscription } from "@weldr/auth";

const session = await auth.api.getSession({
  headers: await headers(),
});

if (!session?.user) {
  // Handle unauthenticated state
}

// session.user is fully typed
const userId: string = session.user.id;
const email: string = session.user.email;
```

### Client-Side Types

```typescript
// Client-side auth hooks
import { authClient } from "@weldr/auth/client";

const { data: session, isPending, error } = authClient.useSession();

// Type-safe session access
if (session?.user) {
  const userId = session.user.id;
  // Use userId for authenticated operations
}
```

## Configuration Patterns

### Server-Side Auth Setup

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@weldr/db";

export const auth = betterAuth({
  baseURL: process.env.NEXT_PUBLIC_BASE_URL,
  trustedOrigins: ["https://weldr.ai", "http://localhost:3000"],
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
  }),

  // Custom ID generation
  advanced: {
    database: {
      generateId: () => nanoid(),
    },
    cookiePrefix: "weldr",
  },

  // Email/password authentication
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    sendResetPassword: async ({ user, url }) => {
      // Send password reset email
    },
  },

  // Email verification
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      // Send verification email
    },
    sendOnSignUp: true,
  },

  // Social providers
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
  },

  // Plugins
  plugins: [
    oAuthProxy(),
    nextCookies(),
    admin(),
    openAPI(),
    organization(),
    stripe({
      /* config */
    }),
  ],
});
```

### Client-Side Auth Setup

```typescript
import { stripeClient } from "@better-auth/stripe/client";
import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [
    adminClient(),
    stripeClient({
      subscription: true,
    }),
  ],
});
```

## Session Management

### Server-Side Session Access

```typescript
import { auth } from "@weldr/auth";

// In Server Components or Route Handlers
const session = await auth.api.getSession({
  headers: await headers(),
});

// List all sessions for current user
const sessions = await auth.api.listSessions({
  headers: await headers(),
});
```

### Client-Side Session Access

```typescript
import { authClient } from "@weldr/auth/client";

// React hook for session
function MyComponent() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return <Loading />;
  if (!session) return <SignInPrompt />;

  return <UserProfile user={session.user} />;
}
```

### Session Operations

```typescript
// Sign out
await authClient.signOut();

// Revoke specific session
await authClient.revokeSession({ token: sessionToken });
```

## Authentication Flows

### Email/Password Sign Up

```typescript
const result = await authClient.signUp.email({
  email: "user@example.com",
  password: "securePassword123!",
  name: "User Name",
});

if (result.error) {
  // Handle error
}
```

### Email/Password Sign In

```typescript
const result = await authClient.signIn.email({
  email: "user@example.com",
  password: "securePassword123!",
  rememberMe: true,
});
```

### Social Sign In

```typescript
// GitHub OAuth
await authClient.signIn.social({
  provider: "github",
  callbackURL: "/dashboard",
});

// Google OAuth
await authClient.signIn.social({
  provider: "google",
  callbackURL: "/dashboard",
});
```

### Password Reset

```typescript
// Request reset email
await authClient.forgetPassword({
  email: "user@example.com",
  redirectTo: "/auth/reset-password",
});

// Reset with token
await authClient.resetPassword({
  newPassword: "newSecurePassword123!",
  token: resetToken,
});
```

## Protected Routes

### Next.js Middleware Pattern

```typescript
// middleware.ts
import { auth } from "@weldr/auth";

export default auth((req) => {
  const isAuth = !!req.auth;
  const isAuthPage = req.nextUrl.pathname.startsWith("/auth");

  if (isAuthPage) {
    if (isAuth) {
      return Response.redirect(new URL("/dashboard", req.url));
    }
    return null;
  }

  if (!isAuth) {
    return Response.redirect(new URL("/auth/sign-in", req.url));
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

### tRPC Protected Procedure

```typescript
// In @weldr/api
import type { Session } from "@weldr/auth";

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in",
    });
  }
  return next({
    ctx: {
      ...ctx,
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});
```

## Email Integration

### Sending Verification Emails

```typescript
import { Resend } from "resend";
import VerificationEmail from "@weldr/emails/verification-email";

const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: "Weldr <noreply@weldr.ai>",
  to: user.email,
  subject: "Verify your email",
  react: (
    <VerificationEmail
      firstName={user.name.split(" ")[0]}
      verificationLink={url}
    />
  ),
});
```

### Sending Password Reset Emails

```typescript
import ResetPasswordEmail from "@weldr/emails/reset-password";

await resend.emails.send({
  from: "Weldr <noreply@weldr.ai>",
  to: user.email,
  subject: "Reset your password",
  react: (
    <ResetPasswordEmail
      firstName={user.name.split(" ")[0]}
      resetPasswordLink={url}
    />
  ),
});
```

## Admin Operations

### User Management

```typescript
import { authClient } from "@weldr/auth/client";

// List users (admin only)
const users = await authClient.admin.listUsers({
  limit: 10,
  offset: 0,
});

// Create user
await authClient.admin.createUser({
  email: "newuser@example.com",
  name: "New User",
  password: "temporaryPassword123!",
});

// Ban user
await authClient.admin.banUser({
  userId: "user_id",
  banExpiresIn: 60 * 60 * 24 * 7, // 7 days
});

// Unban user
await authClient.admin.unbanUser({
  userId: "user_id",
});
```

### Session Management

```typescript
// Revoke all sessions for a user
await authClient.admin.revokeUserSessions({
  userId: "user_id",
});

// Impersonate user (admin only)
await authClient.admin.impersonateUser({
  userId: "user_id",
});
```

## Stripe Integration

### Subscription Configuration

```typescript
stripe({
  stripeClient,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  createCustomerOnSignUp: true,
  subscription: {
    enabled: true,
    plans: [
      {
        name: "pro",
        priceId: "price_xxx",
        limits: { credits: 100 },
      },
    ],
  },
});
```

### Checking Subscription

```typescript
const session = await auth.api.getSession({ headers });

if (session?.user) {
  const subscription = session.user.subscription;
  if (subscription?.status === "active") {
    // User has active subscription
  }
}
```

## Type Exports

```typescript
// Exported types
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
```

## Environment Variables

| Variable                | Required | Description                  |
| ----------------------- | -------- | ---------------------------- |
| `BETTER_AUTH_SECRET`    | Yes      | Auth secret key              |
| `NEXT_PUBLIC_BASE_URL`  | Yes      | Base URL for auth callbacks  |
| `DATABASE_URL`          | Yes      | PostgreSQL connection string |
| `RESEND_API_KEY`        | Yes      | Email delivery service       |
| `GITHUB_CLIENT_ID`      | No       | GitHub OAuth                 |
| `GITHUB_CLIENT_SECRET`  | No       | GitHub OAuth                 |
| `GOOGLE_CLIENT_ID`      | No       | Google OAuth                 |
| `GOOGLE_CLIENT_SECRET`  | No       | Google OAuth                 |
| `STRIPE_SECRET_KEY`     | No       | Stripe API                   |
| `STRIPE_WEBHOOK_SECRET` | No       | Stripe webhooks              |

## Security Patterns

### Password Validation

```typescript
// From @weldr/shared/validators/auth
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain uppercase letter")
  .regex(/[a-z]/, "Password must contain lowercase letter")
  .regex(/[0-9]/, "Password must contain number")
  .regex(/[^A-Za-z0-9]/, "Password must contain special character");
```

### Secure Cookies

- Cookie prefix: "weldr"
- Secure cookies in production
- HTTP-only cookies for session tokens

### Trusted Origins

```typescript
trustedOrigins: ["https://weldr.ai", "http://localhost:3000"],
```

## Do's and Don'ts

### Do's

- Always check session before accessing protected resources
- Use `protectedProcedure` in tRPC for authenticated routes
- Validate passwords with the shared schema
- Use type exports for type safety
- Handle authentication errors gracefully
- Send proper emails for verification and password reset
- Use environment variables for all secrets

### Don'ts

- Expose session tokens in client-side code
- Skip email verification in production
- Store passwords in plain text
- Ignore session expiration
- Trust client-side authentication state without server validation
- Log sensitive authentication data
- Use weak password requirements
