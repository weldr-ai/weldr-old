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
// For projects table - direct userId check
const project = await ctx.db.query.projects.findFirst({
  where: and(
    eq(projects.id, input.id),
    eq(projects.userId, ctx.session.user.id), // REQUIRED: ownership check
  ),
  with: {
    branches: true,
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

// For tables with direct userId column - check userId directly
const branch = await ctx.db.query.branches.findFirst({
  where: and(
    eq(branches.id, input.branchId),
    eq(branches.userId, ctx.session.user.id), // REQUIRED: direct ownership check
  ),
});

if (!branch) {
  throw new TRPCError({
    code: "NOT_FOUND",
    message: "Branch not found",
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

  // Create initial snapshot and main branch
  const [snapshot] = await tx
    .insert(snapshots)
    .values({
      projectId: project.id,
      userId: project.userId, // REQUIRED: set userId
    })
    .returning();

  await tx.insert(branches).values({
    projectId: project.id,
    userId: project.userId, // REQUIRED: set userId
    name: "main",
    snapshotId: snapshot.id,
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
├── index.ts                      # Main exports
├── init.ts                       # tRPC initialization, context, procedures
├── utils.ts                      # Utility functions (agent proxy, mode helpers)
└── router/
    ├── index.ts                  # Router aggregation
    ├── branches.ts               # Branch management (create, move, advance, merge, delete)
    ├── chats.ts                  # Chat messages (add, update, list)
    ├── declarations.ts           # Declaration queries
    ├── environment-variables.ts  # Env var management
    ├── integration-templates.ts  # Integration template queries
    ├── integrations.ts           # Integration CRUD and batch operations
    ├── nodes.ts                  # Canvas node positions
    ├── projects.ts               # Project CRUD
    ├── snapshots.ts              # Snapshot queries (history, compare, DAG traversal)
    └── themes.ts                 # Theme management
```

### Router Aggregation

```typescript
// router/index.ts
export const appRouter = createTRPCRouter({
  projects: projectsRouter,
  chats: chatsRouter,
  environmentVariables: environmentVariablesRouter,
  declarations: declarationsRouter,
  snapshots: snapshotsRouter, // Handles versioning/history
  integrations: integrationsRouter,
  integrationTemplates: integrationTemplatesRouter,
  themes: themesRouter,
  nodes: nodesRouter,
  branches: branchRouter,
});
```

### Protected Procedures with Ownership Validation

**Protected Procedures (ALL require userId ownership validation):**

- `branches.*` - All branch operations (validate via `branch.userId`)
- `snapshots.*` - All snapshot operations (validate via `snapshot.userId`)
- `chats.*` - All chat operations (validate via `chat.userId`)
- `declarations.*` - Declaration queries (validate via `declarations.userId`)
- `integrations.*` - Integration operations (validate via `integration.userId`)
- `environmentVariables.*` - Env var operations (validate `via environmentVariables.userId`)
- `nodes.*` - Node operations (validate via `node.userId`)
- `projects.*` - Project operations (validate via `project.userId`)

**Protected Procedures (DOES NOT require ownership):**

- `integrationTemplates.list`, `integrationTemplates.byId` - These are global templates, not user-specific

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

- `@trpc/server` (11.x) - tRPC server implementation
- `superjson` - Data transformer for complex types
- `zod` (4.x) - Runtime validation schemas
- `redis` - Redis client for caching operations

## Snapshots Router

The snapshots router handles git-like versioning with DAG support:

```typescript
// Recursive CTE for snapshot ancestry
const snapshotsRouter = {
  getHistory: publicProcedure
    .input(z.object({ snapshotId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Uses recursive CTE to traverse snapshotParents DAG
      const history = await ctx.db.execute(sql`
        WITH RECURSIVE ancestry AS (
          SELECT s.* FROM snapshots s WHERE s.id = ${input.snapshotId}
          UNION ALL
          SELECT s.* FROM snapshots s
          JOIN snapshot_parents sp ON s.id = sp.parent_id
          JOIN ancestry a ON sp.snapshot_id = a.id
        )
        SELECT * FROM ancestry
      `);
      return history;
    }),
} satisfies TRPCRouterRecord;
```

## Do's and Don'ts

### Do's

✅ Use `protectedProcedure` for ALL user-owned data operations
✅ **ALWAYS validate userId ownership** - check `userId` directly in WHERE clauses for tables with `userId` columns
✅ Always scope queries by user ID
✅ Use transactions for multi-step operations
✅ Validate inputs with Zod schemas from @weldr/shared
✅ Handle errors explicitly with proper TRPCError codes
✅ Use `satisfies TRPCRouterRecord` for type safety
✅ Export router types for client consumption
✅ Use SuperJSON transformer for complex types (Date, Map, etc.)
✅ Return NOT_FOUND (not FORBIDDEN) when ownership check fails (prevents enumeration)

### Don'ts

❌ **Query user data without ownership validation** (critical security issue!)
❌ Use `any` type
❌ Skip user ownership checks in queries
❌ Ignore TypeScript errors
❌ Expose internal error details to clients
❌ Use publicProcedure for user-owned data (only for global templates)
❌ Skip input validation
❌ Return raw database errors
❌ Forget to handle null/undefined cases
❌ Assume ownership is checked elsewhere - validate in every procedure
❌ Join through project relation when tables have direct `userId` columns - check `userId` directly instead
