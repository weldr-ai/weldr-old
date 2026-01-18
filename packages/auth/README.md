# `@weldr/auth`

Authentication package for the Weldr platform using Better Auth.

## Overview

This package provides authentication functionality using Better Auth, including email/password authentication, social providers (GitHub, Google), email verification, password reset, and Stripe integration for subscriptions.

## Installation

This package is part of the Weldr monorepo and uses workspace protocol:

```json
{
  "dependencies": {
    "@weldr/auth": "workspace:*"
  }
}
```

## Usage

### Server-Side

```typescript
import { auth } from "@weldr/auth";

// Get session
const session = await auth.api.getSession({
  headers: request.headers,
});

// Sign in
await auth.api.signInEmail({
  body: {
    email: "user@example.com",
    password: "password",
  },
});

// Sign up
await auth.api.signUpEmail({
  body: {
    email: "user@example.com",
    password: "password",
    name: "User Name",
  },
});
```

### Client-Side

```typescript
import { AuthClient } from "@/lib/auth/client";

const authClient = new AuthClient({
  baseURL: "http://localhost:3000",
});

// Sign in
await authClient.signIn.email({
  email: "user@example.com",
  password: "password",
});

// Get session
const session = await authClient.getSession();

// Sign out
await authClient.signOut();
```

### React Component

```typescript
import { AuthProvider } from "@weldr/auth";

function App() {
  return (
    <AuthProvider>
      {/* Your app */}
    </AuthProvider>
  );
}
```

## Features

### Authentication Methods

- **Email/Password**: Traditional email and password authentication
- **Social Providers**: GitHub and Google OAuth
- **Email Verification**: Automatic email verification on signup
- **Password Reset**: Secure password reset via email

### Session Management

- Secure session cookies
- Automatic session refresh
- Session validation

### Stripe Integration

- Subscription management
- Customer creation on signup
- Webhook handling
- Plan management

### Organization Support

- Organization creation
- Member management
- Role-based access control

## Configuration

The auth instance is configured with:

- **Database**: Drizzle adapter with PostgreSQL
- **Email**: Resend for email delivery
- **Social Providers**: GitHub and Google
- **Stripe**: Subscription management
- **Plugins**: OAuth proxy, admin, OpenAPI, organization, Stripe

## Type Exports

```typescript
import type { Session, User, Subscription } from "@weldr/auth";

const session: Session = await auth.api.getSession({
  /* ... */
});
const user: User = session.user;
```

## Environment Variables

Required environment variables:

- `BETTER_AUTH_SECRET` - Secret key for authentication
- `BETTER_AUTH_URL` - Base URL for authentication
- `DATABASE_URL` - PostgreSQL connection string
- `RESEND_API_KEY` - Resend API key for emails
- `GITHUB_CLIENT_ID` - GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth client secret
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `STRIPE_SECRET_KEY` - Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret

## Security

- Secure session cookies
- Password hashing
- CSRF protection
- Rate limiting (via Better Auth)
- Secure token generation

## Related Packages

- `@weldr/db` - Database schema for authentication
- `@weldr/emails` - Email templates
- `@weldr/shared` - Shared utilities (nanoid)
