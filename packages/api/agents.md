# API Package Development Guidelines

## Overview

The @weldr/api package provides the tRPC API layer for the Weldr platform. It handles all client-server communication with type-safe procedures, authentication, and database operations using Drizzle ORM.

## Package Scripts

- `bun run clean`: `git clean -xdf .turbo node_modules dist`
- `bun run typecheck`: `tsc --noEmit --emitDeclarationOnly false`

## Type Safety Requirements

### Router Definition Patterns

**Pattern 1: Object with satisfies TRPCRouterRecord**

```typescript
import { TRPCRouterRecord } from "@trpc/server";
import { protectedProcedure } from "../init";

export const myRouter = {
  create: protectedProcedure.input(insertSchema).mutation(async ({ ctx, input }) => {
    // Implementation
  }),
  list: protectedProcedure.query(async ({ ctx }) => {
    // Implementation
  }),
} satisfies TRPCRouterRecord;
```

**Pattern 2: Using createTRPCRouter**

```typescript
import { createTRPCRouter, protectedProcedure } from "../init";

export const myRouter = createTRPCRouter({
  create: protectedProcedure.input(insertSchema).mutation(async ({ ctx, input }) => {
    // Implementation
  }),
});
```

### Procedure Types

```typescript
// Public procedure - no authentication required
export const publicProcedure = t.procedure;

// Protected procedure - requires authenticated session
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to access this resource",
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

### Input Validation with Zod

```typescript
import { z } from "zod";
import { insertProjectSchema } from "@weldr/shared/validators/projects";

// Use shared validators from @weldr/shared
export const myRouter = {
  create: protectedProcedure.input(insertProjectSchema).mutation(async ({ ctx, input }) => {
    // input is fully typed
  }),

  // Or define inline schemas
  byId: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    // input.id is typed as string
  }),
} satisfies TRPCRouterRecord;
```

## Context and Dependencies

### Context Structure

```typescript
export const createTRPCContext = async (opts: { headers: Headers; session: Session | null }) => ({
  headers: opts.headers,
  session: opts.session,
  db, // Drizzle database client from @weldr/db
});
```

### Using Context in Procedures

```typescript
protectedProcedure.query(async ({ ctx }) => {
  // Access authenticated user
  const userId = ctx.session.user.id;

  // Access database
  const projects = await ctx.db.query.projects.findMany({
    where: eq(projects.userId, userId),
  });

  // Access headers for proxying
  const authHeader = ctx.headers.get("authorization");
});
```

## Database Query Patterns

### Basic Queries with Relations

```typescript
const project = await ctx.db.query.projects.findFirst({
  where: and(
    eq(projects.id, input.id),
    eq(projects.userId, ctx.session.user.id), // Always scope by user
  ),
  with: {
    versions: true,
    integrations: {
      with: {
        integrationTemplate: true,
      },
    },
  },
});

if (!project) {
  throw new TRPCError({
    code: "NOT_FOUND",
    message: "Project not found",
  });
}
```

### Insert with Returning

```typescript
const [newProject] = await ctx.db
  .insert(projects)
  .values({
    title: input.title,
    userId: ctx.session.user.id,
  })
  .returning();
```

### Update with Conditions

```typescript
await ctx.db
  .update(projects)
  .set({ status: "active" })
  .where(and(eq(projects.id, input.id), eq(projects.userId, ctx.session.user.id)));
```

### Transactions

```typescript
const result = await ctx.db.transaction(async (tx) => {
  const [project] = await tx.insert(projects).values(projectData).returning();

  if (!project) {
    throw new Error("Failed to create project");
  }

  await tx.insert(versions).values({
    projectId: project.id,
    number: 1,
  });

  return project;
});
```

## Error Handling

### Standard Error Pattern

```typescript
import { Logger } from "@weldr/shared";

try {
  const result = await someOperation();
  return result;
} catch (error) {
  const logger = Logger.get({ operation: "trpc-procedure" });
  logger.error("Operation failed", { extra: { error: error.message } });

  // Re-throw tRPC errors
  if (error instanceof TRPCError) {
    throw error;
  }

  // Wrap other errors
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Failed to perform operation",
  });
}
```

### TRPCError Codes

- `UNAUTHORIZED` - Authentication required
- `NOT_FOUND` - Resource not found
- `BAD_REQUEST` - Invalid request or state
- `CONFLICT` - Duplicate or conflict detected
- `INTERNAL_SERVER_ERROR` - Generic server error
- `FORBIDDEN` - Authenticated but not authorized

### Validation Error Handling

The error formatter automatically flattens Zod errors:

```typescript
errorFormatter: ({ shape, error }) => ({
  ...shape,
  data: {
    ...shape.data,
    zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
  },
}),
```

## Agent Proxy Pattern

### Proxying to Agent Service

```typescript
import { callAgentProxy } from "../utils";

// In a procedure
const result = await callAgentProxy<TriggerWorkflowResponse>(
  "/trigger",
  {
    projectId: input.projectId,
    chatId: input.chatId,
  },
  ctx.headers, // Forward authentication headers
);
```

### callAgentProxy Implementation

```typescript
import { TRPCError } from "@trpc/server";

async function callAgentProxy<T = unknown>(
  endpoint: string,
  body: { projectId: string } & Record<string, unknown>,
  requestHeaders?: Headers,
): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const proxyUrl = `${baseUrl}/api/proxy`;

  const proxyHeaders = new Headers();
  proxyHeaders.set("content-type", "application/json");

  const headersToExclude = new Set(["content-length", "host", "connection", "transfer-encoding"]);
  requestHeaders?.forEach((value, key) => {
    if (!headersToExclude.has(key.toLowerCase())) {
      proxyHeaders.set(key, value);
    }
  });

  const response = await fetch(proxyUrl, {
    method: "POST",
    headers: proxyHeaders,
    body: JSON.stringify({ endpoint, ...body }),
  });

  if (!response.ok) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Agent proxy request failed",
    });
  }

  return response.json() as Promise<T>;
}
```

## Local Mode Support

### Checking Local Mode

```typescript
import { isLocalMode } from "../utils";

if (!isLocalMode()) {
  // Cloud-only operations
  await Fly.app.create(appName, config);
  await Tigris.bucket.create(bucketName);
}
```

## Router Organization

### File Structure

```
src/
├── index.ts           # Main exports
├── init.ts            # tRPC initialization, context, procedures
├── utils.ts           # Utility functions (agent proxy)
└── router/
    ├── index.ts       # Router aggregation
    ├── projects.ts    # Project CRUD
    ├── chats.ts       # Chat/messages
    ├── branches.ts    # Branch management
    ├── versions.ts    # Version control
    ├── integrations.ts
    ├── integration-templates.ts
    ├── environment-variables.ts
    ├── declarations.ts
    ├── nodes.ts
    └── themes.ts
```

### Router Aggregation

```typescript
// router/index.ts
export const appRouter = createTRPCRouter({
  projects: projectsRouter,
  chats: chatsRouter,
  environmentVariables: environmentVariablesRouter,
  declarations: declarationsRouter,
  versions: versionRouter,
  integrations: integrationsRouter,
  integrationTemplates: integrationTemplatesRouter,
  themes: themesRouter,
  nodes: nodesRouter,
  branches: branchRouter,
});
```

## Type Exports

### Exporting Router Types

```typescript
// index.ts
export { appRouter, createCaller, createTRPCContext };
export type { AppRouter, RouterInputs, RouterOutputs };

// Usage in client
import type { RouterInputs, RouterOutputs } from "@weldr/api";

type ProjectCreateInput = RouterInputs["projects"]["create"];
type ProjectListOutput = RouterOutputs["projects"]["list"];
```

## Dependencies

### Internal Packages

- `@weldr/auth` - Session types for authentication
- `@weldr/db` - Database access, Drizzle ORM, schema definitions
- `@weldr/shared` - Validators, utilities, types

### External Dependencies

- `@trpc/server` - tRPC server implementation
- `superjson` - Data transformer for complex types
- `zod` - Runtime validation schemas

## Do's and Don'ts

### Do's

- Use `protectedProcedure` for authenticated routes
- Always scope queries by user ID
- Use transactions for multi-step operations
- Validate inputs with Zod schemas from @weldr/shared
- Handle errors explicitly with proper TRPCError codes
- Use `satisfies TRPCRouterRecord` for type safety
- Export router types for client consumption
- Use SuperJSON transformer for complex types (Date, Map, etc.)

### Don'ts

- Use `any` type
- Skip user ownership checks in queries
- Ignore TypeScript errors
- Expose internal error details to clients
- Use publicProcedure for sensitive operations
- Skip input validation
- Return raw database errors
- Forget to handle null/undefined cases
