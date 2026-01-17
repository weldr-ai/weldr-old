# Database Package Development Guidelines

## Overview

The @weldr/db package manages all database operations using Drizzle ORM with PostgreSQL. It provides type-safe schema definitions, migrations, and database utilities for the entire monorepo.

## Current Structure

```
packages/db/
├── drizzle.config.ts          # Drizzle kit configuration
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts               # Main entry - exports db client and drizzle-orm
    ├── types.ts               # Transaction (Tx) and Db type exports
    ├── utils.ts               # mergeJson helper utility for JSONB updates
    ├── seed.ts                # Main seeding orchestrator
    ├── migrations/
    │   └── *.sql              # Migration files with meta tracking
    ├── scripts/
    │   ├── seed-ai-models.ts  # AI models seeding
    │   └── seed-project-data.ts # Project data seeding
    └── schema/
        ├── index.ts           # Barrel export for all schemas
        ├── relations.ts       # All Drizzle relations defined centrally
        ├── ai-models.ts       # AI model pricing and configuration
        ├── auth.ts            # Better Auth tables (users, sessions, accounts, orgs)
        ├── branches.ts        # Git-like mutable branch pointers
        ├── chats.ts           # Chat conversations, messages, attachments, streams
        ├── declaration-templates.ts  # Template declarations linked to integrations
        ├── declarations.ts    # Code declarations with vector embeddings
        ├── dependencies.ts    # Declaration dependency junction table
        ├── environment-variables.ts  # Project environment variables
        ├── integration-categories.ts # Integration groupings
        ├── integration-templates.ts  # Available integration templates
        ├── integrations.ts    # Project-level integration config
        ├── nodes.ts           # Visual canvas nodes with JSONB positions
        ├── projects.ts        # Project entities with subdomain
        ├── snapshot-declarations.ts  # Junction linking snapshots to declarations
        ├── snapshots.ts       # Immutable commit-like snapshots (DAG structure)
        ├── themes.ts          # JSONB theme data
        └── vault.ts           # Encrypted secrets (pgsodium)
```

### Architecture Overview

The database uses a **git-like versioning model**:

- **Snapshots**: Immutable commit-like records representing a point-in-time state
- **Branches**: Mutable pointers to snapshots (like git branch refs)
- **snapshotParents**: Junction table enabling DAG structure for merge support
- **snapshotDeclarations**: Junction linking snapshots to their declarations

### Core Domain Tables

| Table                  | Description                 | Key Features                                     | Ownership              |
| ---------------------- | --------------------------- | ------------------------------------------------ | ---------------------- |
| `projects`             | Project entities            | nanoid PK, unique subdomain                      | Direct `userId` FK     |
| `branches`             | Git-like branches           | Points to snapshot, unique name per project      | Direct `userId` FK     |
| `snapshots`            | Immutable commit-like state | DAG structure via snapshotParents, token metrics | Direct `userId` FK     |
| `snapshotParents`      | Junction for DAG            | Composite PK, enables merge scenarios            | Via snapshot ownership |
| `snapshotDeclarations` | Junction table              | Links snapshots to declarations                  | Via snapshot ownership |
| `chats`                | Chat conversations          | Messages, project context                        | Direct `userId` FK     |
| `declarations`         | Code declarations           | Vector embeddings, progress state                | Direct `userId` FK     |
| `nodes`                | Visual canvas nodes         | JSONB position data                              | Direct `userId` FK     |
| `environmentVariables` | Project env vars            | Linked to vault secrets                          | Direct `userId` FK     |

### Ownership Validation Pattern

All queries for user-owned resources MUST validate ownership using the direct `userId` column:

```typescript
// For tables with direct userId FK, check userId directly
const branch = await db.query.branches.findFirst({
  where: and(eq(branches.id, branchId), eq(branches.userId, userId)),
});

if (!branch) {
  throw new Error("Not found or not authorized");
}
```

### Integration Tables

| Table                      | Description            | Key Features                              | Ownership                                   |
| -------------------------- | ---------------------- | ----------------------------------------- | ------------------------------------------- |
| `integrationCategories`    | Integration groups     | Key-based, priority ordering              | Global (no ownership)                       |
| `integrationTemplates`     | Available integrations | Version, options JSONB, recommended flags | Global (no ownership)                       |
| `integrations`             | Installed integrations | Project-specific, options JSONB           | Direct `userId` FK                          |
| `integrationInstallations` | Installation tracking  | Status, metadata, per snapshot            | Via `integrationId` -> `integration.userId` |

## Type Safety Requirements

### Schema Definition

```typescript
// ALWAYS define schemas with proper types and constraints
import { pgTable, text, timestamp, boolean, integer, uuid } from "drizzle-orm/pg-core";
import { nanoid } from "@weldr/shared/nanoid";

export const tableName = pgTable("table_name", {
  // Use nanoid for primary keys
  id: text("id")
    .$defaultFn(() => nanoid())
    .primaryKey(),

  // Required fields
  name: text("name").notNull(),

  // Optional fields with defaults
  status: text("status", {
    enum: ["pending", "active", "archived"],
  }).default("pending"),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),

  // Foreign keys
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});
```

### Relations

```typescript
// ALWAYS define relations for better query ergonomics
import { relations } from "drizzle-orm";

export const tableNameRelations = relations(tableName, ({ one, many }) => ({
  // One-to-one relation
  user: one(users, {
    fields: [tableName.userId],
    references: [users.id],
  }),

  // One-to-many relation
  items: many(items),
}));
```

### Type Exports

```typescript
// ALWAYS export inferred types
import { InferSelectModel, InferInsertModel } from "drizzle-orm";

// Select type (for queries)
export type TableName = InferSelectModel<typeof tableName>;

// Insert type (for mutations)
export type InsertTableName = InferInsertModel<typeof tableName>;

// Partial update type
export type UpdateTableName = Partial<InsertTableName>;
```

## Schema Organization

### File Structure

```
src/schema/
├── index.ts                    # Barrel export for all schemas
├── relations.ts                # All Drizzle relations (centralized)
├── auth.ts                     # Better Auth tables (users, sessions, accounts, orgs, subscriptions)
├── projects.ts                 # Project entities
├── branches.ts                 # Git-like mutable branch pointers
├── snapshots.ts                # Immutable commit-like snapshots
├── snapshot-declarations.ts    # Junction: snapshots <-> declarations
├── chats.ts                    # Chat conversations, messages, attachments, streams
├── declarations.ts             # Code declarations with vector embeddings (1536d)
├── declaration-templates.ts    # Template declarations for integrations
├── dependencies.ts             # Declaration dependency junction
├── integrations.ts             # Project-level integration config
├── integration-categories.ts   # Integration groupings
├── integration-templates.ts    # Available integration templates
├── environment-variables.ts    # Project env vars (linked to vault)
├── nodes.ts                    # Visual canvas nodes
├── themes.ts                   # JSONB theme data
├── ai-models.ts                # AI model pricing configuration
└── vault.ts                    # Encrypted secrets (pgsodium, separate schema)
```

### Naming Conventions

- Table names: Plural, snake_case in DB, camelCase in code
- Column names: snake_case in DB, camelCase in code
- Foreign keys: `{table}_id` pattern
- Junction tables: `{table1}_to_{table2}`

## Migration Management

### Creating Migrations

```bash
# Generate migration from schema changes
bun generate

# Apply migrations to database
bun migrate

# Push schema directly (development only)
bun push
```

### Migration Best Practices

- `drizzle.config.ts` enumerates schema files explicitly; update it when adding/removing schema files.

```typescript
// ALWAYS test migrations locally first
// NEVER modify existing migrations
// ALWAYS backup production data before migrations
// Use transactions for complex migrations
```

## Query Patterns

### Basic Queries

```typescript
// Select with relations - ALWAYS validate userId ownership
const projectWithRelations = await db.query.projects.findFirst({
  where: and(
    eq(projects.id, projectId),
    eq(projects.userId, userId), // REQUIRED: ownership check
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

// Insert with returning
const [newProject] = await db
  .insert(projects)
  .values({
    title: "New Project",
    userId: session.user.id,
  })
  .returning();

// Update with conditions - ALWAYS include userId check
await db
  .update(projects)
  .set({ status: "active" })
  .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

// Delete with cascade - ALWAYS include userId check
await db.delete(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

await db
  .update(branches)
  .set({ name: "new-name" })
  .where(and(eq(branches.id, branchId), eq(branches.userId, userId)));
```

### Transaction Patterns

```typescript
// ALWAYS use transactions for multi-step operations
const result = await db.transaction(async (tx) => {
  // Create project
  const [project] = await tx.insert(projects).values(projectData).returning();

  if (!project) {
    throw new Error("Failed to create project");
  }

  // Create related records (e.g., initial snapshot and branch)
  const [snapshot] = await tx
    .insert(snapshots)
    .values({
      projectId: project.id,
      type: "initial",
    })
    .returning();

  await tx.insert(branches).values({
    projectId: project.id,
    name: "main",
    snapshotId: snapshot.id,
  });

  // Return transaction result
  return project;
});
```

### Complex Queries

```typescript
// Use subqueries for complex logic
const activeProjects = db
  .select()
  .from(projects)
  .where(exists(db.select().from(branches).where(eq(branches.projectId, projects.id))));

// Aggregations
const projectStats = await db
  .select({
    userId: projects.userId,
    count: count(projects.id),
    latestCreated: max(projects.createdAt),
  })
  .from(projects)
  .groupBy(projects.userId);
```

## Index Strategy

### Index Definition

```typescript
import { index, uniqueIndex } from "drizzle-orm/pg-core";

export const tableName = pgTable(
  "table_name",
  {
    // columns...
  },
  (table) => ({
    // Single column index
    userIdIdx: index("user_id_idx").on(table.userId),

    // Composite index
    statusCreatedIdx: index("status_created_idx").on(table.status, table.createdAt),

    // Unique index
    slugIdx: uniqueIndex("slug_idx").on(table.slug),
  }),
);
```

### Index Guidelines

- Index foreign keys
- Index columns used in WHERE clauses
- Index columns used in ORDER BY
- Consider composite indexes for common query patterns
- Monitor query performance with EXPLAIN

## Seed Data

### Seed Script Pattern

```typescript
// src/seed.ts
import { db } from "./index";
import { users, projects } from "./schema";
import { Logger } from "@weldr/shared";

async function seed() {
  const logger = Logger.get({ operation: "database-seeding" });
  logger.info("Seeding database started");

  try {
    // Clear existing data
    await db.delete(projects);
    await db.delete(users);

    // Insert seed data
    const [user] = await db
      .insert(users)
      .values({
        email: "test@example.com",
        name: "Test User",
      })
      .returning();

    await db.insert(projects).values([
      {
        title: "Sample Project 1",
        userId: user.id,
      },
      {
        title: "Sample Project 2",
        userId: user.id,
      },
    ]);

    logger.info("Seeding completed successfully");
  } catch (error) {
    logger.error("Seeding failed", { extra: { error: error.message } });
    process.exit(1);
  }
}

seed();
```

## Connection Management

### Database Client

```typescript
// src/index.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const conn = globalForDb.conn ?? postgres(connectionString);
if (process.env.NODE_ENV !== "production") {
  globalForDb.conn = conn;
}

export const db = drizzle(conn, { schema });
export * from "drizzle-orm";
```

## Validation Integration

### Zod Schema Generation

```typescript
// Generate Zod schemas from Drizzle tables
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Auto-generate base schemas
export const selectProjectSchema = createSelectSchema(projects);
export const insertProjectSchema = createInsertSchema(projects);

// Extend with custom validation
export const updateProjectSchema = insertProjectSchema.partial().extend({
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});
```

## Performance Optimization

### Query Optimization

```typescript
// Use select specific columns
const lightweightProjects = await db
  .select({
    id: projects.id,
    title: projects.title,
    createdAt: projects.createdAt,
  })
  .from(projects);

// Use limit for pagination
const paginatedResults = await db
  .select()
  .from(projects)
  .limit(10)
  .offset(page * 10);

// Prepare statements for repeated queries
const preparedQuery = db
  .select()
  .from(projects)
  .where(eq(projects.id, sql.placeholder("id")))
  .prepare("getProjectById");

const project = await preparedQuery.execute({ id: projectId });
```

### Connection Pooling

```typescript
// Configure connection pool
const client = postgres(connectionString, {
  max: 20, // Maximum connections
  idle_timeout: 20, // Close idle connections after 20s
  connect_timeout: 10, // Connection timeout
  max_lifetime: 60 * 30, // Max connection lifetime (30 min)
});
```

## Error Handling

### Database Error Handling

```typescript
import { PostgresError } from "postgres";

try {
  await db.insert(projects).values(data);
} catch (error) {
  if (error instanceof PostgresError) {
    switch (error.code) {
      case "23505": // Unique violation
        throw new Error("Project already exists");
      case "23503": // Foreign key violation
        throw new Error("Referenced record not found");
      case "23502": // Not null violation
        throw new Error("Required field missing");
      default:
        throw new Error(`Database error: ${error.message}`);
    }
  }
  throw error;
}
```

## Testing

### Test Database Setup

```typescript
// Use separate test database
const testDb = drizzle(postgres(process.env.TEST_DATABASE_URL), { schema });

// Reset database before tests
beforeEach(async () => {
  await testDb.execute(sql`TRUNCATE TABLE projects CASCADE`);
});

// Test transactions rollback automatically
test("should rollback on error", async () => {
  await expect(
    testDb.transaction(async (tx) => {
      await tx.insert(projects).values(data);
      throw new Error("Rollback");
    }),
  ).rejects.toThrow("Rollback");

  const count = await testDb.select().from(projects);
  expect(count).toHaveLength(0);
});
```

## Security Considerations

### User Ownership Validation (CRITICAL)

**EVERY query for user-owned data MUST validate ownership:**

```typescript
// ❌ BAD - No ownership check (security vulnerability!)
const project = await db.query.projects.findFirst({
  where: eq(projects.id, projectId),
});

// ✅ GOOD - Direct userId check for projects table
const project = await db.query.projects.findFirst({
  where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
});

// ✅ GOOD - Direct userId check for tables with userId column
const branch = await db.query.branches.findFirst({
  where: and(eq(branches.id, branchId), eq(branches.userId, userId)),
});
if (!branch) {
  throw new Error("Not authorized");
}

// ✅ GOOD - Direct userId check for updates/deletes
await db.delete(branches).where(and(eq(branches.id, branchId), eq(branches.userId, userId)));
```

### SQL Injection Prevention

```typescript
// ALWAYS use parameterized queries
// ✅ GOOD - Parameterized
await db.select().from(projects).where(eq(projects.id, userInput));

// ❌ BAD - SQL injection vulnerable
await db.execute(sql`SELECT * FROM projects WHERE id = ${userInput}`);

// ✅ GOOD - Using placeholder for raw SQL
await db.execute(sql`SELECT * FROM projects WHERE id = ${sql.placeholder("id")}`, {
  id: userInput,
});
```

### Data Sanitization

```typescript
// Sanitize user input before insertion
const sanitizedData = {
  ...userData,
  title: userData.title.trim().substring(0, 100),
  description: sanitizeHtml(userData.description),
};
```

## Monitoring

### Query Logging

```typescript
// Enable query logging in development
import { Logger } from "@weldr/shared";

export const db = drizzle(client, {
  schema,
  logger:
    process.env.NODE_ENV === "development"
      ? {
          logQuery: (query, params) => {
            const logger = Logger.get({ operation: "database-query" });
            logger.debug("Database query executed", {
              extra: { query, params },
            });
          },
        }
      : false,
});
```

### Performance Monitoring

```typescript
// Track slow queries
import { Logger } from "@weldr/shared";

const logger = Logger.get({ operation: "database-query" });
const startTime = Date.now();
const result = await db.select().from(projects);
const duration = Date.now() - startTime;

if (duration > 1000) {
  logger.warn("Slow query detected", {
    extra: { duration, query: "select from projects" },
  });
}
```

## Do's and Don'ts

### Do's

✅ **ALWAYS validate userId ownership** on all user-owned data queries
✅ Use transactions for multi-step operations
✅ Define proper indexes for performance
✅ Use TypeScript types from schema
✅ Validate input with Zod schemas
✅ Handle database errors properly
✅ Use connection pooling
✅ Test migrations locally first
✅ Use parameterized queries
✅ Export inferred types
✅ Check `userId` directly in WHERE clauses for tables with `userId` columns

### Don'ts

❌ **Query user-owned data without userId validation** (security vulnerability!)
❌ Modify existing migrations
❌ Use raw SQL without parameterization
❌ Skip transaction for related operations
❌ Ignore foreign key constraints
❌ Use synchronous database operations
❌ Store sensitive data unencrypted
❌ Skip index on foreign keys
❌ Use SELECT \* in production
❌ Ignore connection limits
❌ Assume ownership is validated elsewhere - always check in the query
❌ Join through project relation when tables have direct `userId` columns - check `userId` directly instead
