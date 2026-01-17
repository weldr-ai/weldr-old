# API v2 Package Guidelines

ORPC API package for **Weldr**. This package defines all API routes using ORPC (type-safe RPC framework).

## Overview

The `@weldr/api_v2` package provides:

- Type-safe API endpoints using ORPC
- REST and RPC handlers
- OpenAPI documentation generation
- Authentication middleware
- Error handling and logging

## Responsibilities

- Define all API routes and procedures
- Handle authentication and authorization
- Provide type-safe API contracts
- Generate OpenAPI documentation
- Manage request/response handling

## Tech Stack

- **API Framework**: ORPC (type-safe RPC)
- **Database**: PostgreSQL + Drizzle ORM (via `@weldr/db`)
- **Auth**: Better-Auth (via `@weldr/auth`)
- **Validation**: Zod
- **Error Tracking**: Sentry middleware
- **Logging**: Pino (via `@orpc/experimental-pino`)

## File Structure

```
src/
├── lib/
│   ├── context.ts      # ORPC context definition
│   ├── handlers.ts     # ORPC handlers (RPC and OpenAPI)
│   └── procedures.ts   # Procedures (publicProcedure, protectedProcedure)
├── middlewares/
│   ├── auth.ts         # Auth middleware
│   ├── retry.ts        # Retry middleware
│   └── sentry.ts       # Sentry middleware
└── router/             # ORPC router modules
    ├── health.ts       # Health check
    ├── ready.ts        # Readiness check
    └── index.ts        # Router exports
```

## ORPC Procedures

### Public Procedure

For endpoints that don't require authentication:

```ts
import { publicProcedure } from "@/lib/procedures";
import { z } from "zod";
import type { Route } from "@orpc/server";

const definition = {
  method: "GET",
  tags: ["Projects"],
  path: "/projects",
  successStatus: 200,
  description: "List all projects",
  summary: "List projects",
} satisfies Route;

export default publicProcedure
  .route(definition)
  .input(
    z.object({
      query: z.string().optional(),
    }),
  )
  .handler(async ({ input, context }) => {
    const { db } = context;
    // Your logic here
    return { success: true };
  });
```

### Protected Procedure

For endpoints that require authentication:

```ts
import { protectedProcedure } from "@/lib/procedures";
import { z } from "zod";
import type { Route } from "@orpc/server";

const definition = {
  method: "POST",
  tags: ["Projects"],
  path: "/projects",
  successStatus: 201,
  description: "Create a new project",
  summary: "Create project",
} satisfies Route;

export default protectedProcedure
  .route(definition)
  .input(
    z.object({
      name: z.string().min(1),
      description: z.string().optional(),
    }),
  )
  .handler(async ({ input, context }) => {
    // context.session and context.user are guaranteed
    const userId = context.user.id;
    const { db } = context;

    // Your logic here
    return { success: true };
  });
```

### Available in Context

```ts
interface ORPCContext {
  db?: typeof db; // Database instance (from @weldr/db)
  reqHeaders?: Headers; // Request headers
  resHeaders?: Headers; // Response headers
  session?: Session; // User session (if authenticated)
  user?: User; // User object (if authenticated)
  logger?: Logger; // Pino logger (via @orpc/experimental-pino)
}
```

Access logger via `context.logger` or `getLogger(context)` from `@orpc/experimental-pino`.

## Authentication

### Auth Configuration

Auth is configured in `packages/auth/src/index.tsx` and exported as `@weldr/auth`:

```ts
import { auth } from "@weldr/auth";

// Get session from headers
const session = await auth.api.getSession({ headers: context.reqHeaders });
const user = session?.user;
```

### Protecting Endpoints

Use `protectedProcedure` - it automatically:

1. Checks for valid session via auth middleware
2. Throws `UNAUTHORIZED` error if not authenticated
3. Adds `session` and `user` to context

```ts
import { protectedProcedure } from "@/lib/procedures";
import { projects } from "@weldr/db/schema";
import { eq } from "drizzle-orm";
import type { Route } from "@orpc/server";

const definition = {
  method: "GET",
  tags: ["Projects"],
  path: "/projects",
  successStatus: 200,
  description: "List user projects",
  summary: "List projects",
} satisfies Route;

export default protectedProcedure.route(definition).handler(async ({ context }) => {
  // Safe to access - guaranteed to exist
  const userId = context.user.id;

  return await context.db.query.projects.findMany({
    where: eq(projects.userId, userId),
  });
});
```

## Database (Drizzle)

### Schema Definition

Define schemas in `packages/db/src/schema/`:

```ts
// packages/db/src/schema/projects.ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
```

### Database Access

```ts
// Import database client
import { db } from "@weldr/db";
import { projects } from "@weldr/db/schema";

// In ORPC procedures, use context.db (recommended)
const projects = await context.db.query.projects.findMany();

// Or import db directly
const projects = await db.query.projects.findMany();
```

### Queries

```ts
import { eq, and, desc } from "drizzle-orm";
import { projects } from "@weldr/db/schema";

// Find many
const userProjects = await context.db.query.projects.findMany({
  where: eq(projects.userId, userId),
  orderBy: desc(projects.createdAt),
});

// Find one
const project = await context.db.query.projects.findFirst({
  where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
});

// Insert
const [newProject] = await context.db
  .insert(projects)
  .values({ userId, name, description })
  .returning();

// Update
await context.db
  .update(projects)
  .set({ name, updatedAt: new Date() })
  .where(eq(projects.id, projectId));

// Delete
await context.db.delete(projects).where(eq(projects.id, projectId));
```

### Relations

```ts
// In schema file
export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(user, {
    fields: [projects.userId],
    references: [user.id],
  }),
  branches: many(branches),
  snapshots: many(snapshots),
}));

// Query with relations
const project = await context.db.query.projects.findFirst({
  where: eq(projects.id, projectId),
  with: {
    branches: true,
    snapshots: true,
  },
});
```

## Logging (Pino)

### In ORPC Procedures

```ts
import { getLogger } from "@orpc/experimental-pino";

export default publicProcedure.handler(async ({ context }) => {
  const logger = context.logger ?? getLogger(context);

  logger?.info({ projectId }, "Project created");
  logger?.warn({ userId }, "Rate limit approaching");
  logger?.error({ err, projectId }, "Failed to create project");
});
```

## Error Handling

### ORPC Errors

```ts
import { ORPCError } from "@orpc/server";

// In a procedure
if (!project) {
  throw new ORPCError("NOT_FOUND", "Project not found");
}

if (!hasPermission) {
  throw new ORPCError("FORBIDDEN", "Not authorized to access this resource");
}

// Available codes: UNAUTHORIZED, FORBIDDEN, NOT_FOUND, BAD_REQUEST, INTERNAL_SERVER_ERROR
```

### Sentry (Automatic)

Errors are automatically captured by the Sentry middleware. For manual capture:

```ts
import * as Sentry from "@sentry/bun";

// Capture exception with context
Sentry.captureException(error, {
  extra: { projectId, userId },
});

// Add breadcrumb
Sentry.addBreadcrumb({
  message: "Processing branch",
  level: "info",
  data: { branchId },
});
```

### Custom Spans

```ts
import * as Sentry from "@sentry/bun";

const result = await Sentry.startSpan({ name: "processBranch", op: "branch.process" }, async () => {
  // Long-running operation
  return await processBranchCode(branchId);
});
```

## Input Validation (Zod)

Always validate inputs with Zod:

```ts
import { z } from "zod";

const CreateProjectInput = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  integrationIds: z.array(z.string().uuid()).optional(),
});

export default protectedProcedure
  .route(definition)
  .input(CreateProjectInput)
  .handler(async ({ input, context }) => {
    // input is fully typed and validated
    const { name, description, integrationIds } = input;
  });
```

## Creating New Routes

### 1. Create the route file

```ts
// src/router/projects.ts
import { getLogger } from "@orpc/experimental-pino";
import type { Route } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { projects } from "@weldr/db/schema";
import { eq } from "drizzle-orm";

import { protectedProcedure } from "@/lib/procedures";

// List projects route
const listDefinition = {
  method: "GET",
  tags: ["Projects"],
  path: "/projects",
  successStatus: 200,
  description: "List all user projects",
  summary: "List projects",
} satisfies Route;

export const list = protectedProcedure.route(listDefinition).handler(async ({ context }) => {
  const logger = getLogger(context);
  const userId = context.user.id;

  logger?.info({ userId }, "Listing projects");

  return await context.db.query.projects.findMany({
    where: eq(projects.userId, userId),
  });
});

// Create project route
const createDefinition = {
  method: "POST",
  tags: ["Projects"],
  path: "/projects",
  successStatus: 201,
  description: "Create a new project",
  summary: "Create project",
} satisfies Route;

const createInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
});

export const create = protectedProcedure
  .route(createDefinition)
  .input(createInputSchema)
  .handler(async ({ input, context }) => {
    const logger = getLogger(context);
    const userId = context.user.id;

    logger?.info({ userId, name: input.name }, "Creating project");

    const [project] = await context.db
      .insert(projects)
      .values({
        userId,
        name: input.name,
        description: input.description,
      })
      .returning();

    return project;
  });

// Get project route
const getDefinition = {
  method: "GET",
  tags: ["Projects"],
  path: "/projects/:id",
  successStatus: 200,
  description: "Get project by ID",
  summary: "Get project",
} satisfies Route;

const getInputSchema = z.object({
  id: z.string().uuid(),
});

export const get = protectedProcedure
  .route(getDefinition)
  .input(getInputSchema)
  .handler(async ({ input, context }) => {
    const userId = context.user.id;

    const project = await context.db.query.projects.findFirst({
      where: eq(projects.id, input.id),
    });

    if (!project || project.userId !== userId) {
      throw new ORPCError("NOT_FOUND", "Project not found");
    }

    return project;
  });
```

### 2. Add to router

```ts
// src/router/index.ts
import health from "./health";
import ready from "./ready";
import * as projects from "./projects";

export const router = {
  health,
  ready,
  projects,
};
```

## Route Definition

Each route must define a `Route` object with:

- `method`: HTTP method ("GET", "POST", "PUT", "DELETE", etc.)
- `tags`: Array of tags for OpenAPI grouping (e.g., `["Projects"]`)
- `path`: URL path (e.g., `"/projects"` or `"/projects/:id"`)
- `successStatus`: HTTP status code for success (e.g., `200`, `201`)
- `description`: Detailed description for OpenAPI docs
- `summary`: Short summary for OpenAPI docs

```ts
const definition = {
  method: "GET",
  tags: ["Projects"],
  path: "/projects",
  successStatus: 200,
  description: "List all user projects",
  summary: "List projects",
} satisfies Route;
```

## Output Validation

You can optionally define output schemas for type safety:

```ts
const outputSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: z.date(),
});

export default protectedProcedure
  .route(definition)
  .output(outputSchema)
  .handler(async ({ context }) => {
    // Return value will be validated against outputSchema
    return { ... };
  });
```

## TypeScript Rules

- **NEVER use `any`** - always use proper types, `unknown`, or generics
- Use explicit return types for exported functions
- Infer types from Zod schemas: `z.infer<typeof schema>`
- Infer types from Drizzle schemas: `typeof table.$inferSelect`
- Use `satisfies` for type checking without widening

```ts
// ✅ CORRECT
import { z } from "zod";
import { projects } from "@weldr/db/schema";

type Project = typeof projects.$inferSelect;
type NewProject = typeof projects.$inferInsert;

const InputSchema = z.object({ name: z.string() });
type Input = z.infer<typeof InputSchema>;

// ❌ WRONG
const data: any = await db.query.projects.findFirst();
function process(input: any) {}
```

## Agent Autonomy

### DO Automatically

- **Run linter after EVERY file change** - fix all errors before proceeding
- **Use full TypeScript types** - never use `any`, always properly type everything
- Use `protectedProcedure` for authenticated endpoints
- Add Zod schemas for all inputs
- Use Drizzle queries with proper typing
- Add logging for important operations
- Throw appropriate `ORPCError` codes
- Follow existing patterns in `src/router/`
- Export types from schema files
- Infer types from Drizzle and Zod schemas
- Import from workspace packages (`@weldr/*`) instead of relative paths
- Define route definitions with `satisfies Route`
- Use proper HTTP methods and status codes

### DO NOT Without Asking

- Change database schema (create migration files)
- Add new middleware
- Modify auth configuration
- Change the router structure significantly
- Add external API integrations
- Create new environment variables

### When Adding Database Tables

1. Create schema file in `packages/db/src/schema/`
2. Export from `packages/db/src/schema/index.ts`
3. Run `bun run db:generate` to create migration
4. Run `bun run db:migrate` to apply
5. Create corresponding router handlers in `src/router/`

### After Every Code Change

1. **Check linter** - run and fix ALL errors before moving on
2. **Verify types** - ensure no `any` types anywhere

### Checklist for New Endpoints

- [ ] Route definition with proper HTTP method, path, and status codes
- [ ] Input validated with Zod schema
- [ ] Types inferred from Zod schema (not duplicated)
- [ ] Using correct procedure (public/protected)
- [ ] Proper error handling with ORPCError
- [ ] Logging for important operations
- [ ] Type-safe database queries (no `any`)
- [ ] Exported from router
- [ ] **Linter passes with no errors**

## Quick Reference

| Task               | How To                                                     |
| ------------------ | ---------------------------------------------------------- |
| Protected endpoint | `protectedProcedure.route(definition).handler()`           |
| Public endpoint    | `publicProcedure.route(definition).handler()`              |
| Get user ID        | `context.user.id`                                          |
| Get database       | `context.db`                                               |
| Log message        | `context.logger?.info()` or `getLogger(context)?.info()`   |
| Throw 404          | `throw new ORPCError("NOT_FOUND", "message")`              |
| Throw 401          | `throw new ORPCError("UNAUTHORIZED", "message")`           |
| Throw 403          | `throw new ORPCError("FORBIDDEN", "message")`              |
| Validate input     | `.input(z.object({ ... }))`                                |
| Validate output    | `.output(z.object({ ... }))`                               |
| Generate ID        | `import { nanoid } from "@weldr/shared/nanoid"`            |
| Custom span        | `Sentry.startSpan({ name }, async () => {})`               |
| Import db schema   | `import { projects } from "@weldr/db/schema"`              |
| Import auth        | `import { auth } from "@weldr/auth"`                       |
| Define route       | `const definition = { method, path, ... } satisfies Route` |
