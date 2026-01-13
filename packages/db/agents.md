# Database Package Development Guidelines

## Overview

The @weldr/db package manages all database operations using Drizzle ORM with PostgreSQL. It provides type-safe schema definitions, migrations, and database utilities for the entire monorepo.

## Current Structure

- `src/schema`: tables for projects, branches/versions, chats/messages, declarations/templates, dependencies, nodes, integrations (categories/templates), environment variables, themes, vault, auth tables, ai models, plus `relations.ts` and `version-declarations.ts`
- `src/migrations`: SQL migration history and meta tracking
- `src/index.ts`: drizzle client setup and exports
- `src/types.ts`: shared types from schemas
- `src/scripts` and `seed.ts`: helpers for seeding and maintenance
- `src/utils.ts`: common helpers for DB interactions

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
├── index.ts                 # Main export file
├── auth.ts                  # Authentication tables
├── projects.ts              # Project-related tables
├── chats.ts                 # Chat and messaging tables
├── declarations.ts          # Code declarations tables
├── integrations.ts          # Integration tables
├── environment-variables.ts
├── branches-versions.ts
├── version-declarations.ts
├── relations.ts
└── vault.ts
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
// Select with relations
const projectWithRelations = await db.query.projects.findFirst({
  where: eq(projects.id, projectId),
  with: {
    versions: true,
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

// Update with conditions
await db
  .update(projects)
  .set({ status: "active" })
  .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

// Delete with cascade
await db.delete(projects).where(eq(projects.id, projectId));
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

  // Create related records
  await tx.insert(versions).values({
    projectId: project.id,
    number: 1,
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
  .where(
    exists(
      db
        .select()
        .from(versions)
        .where(and(eq(versions.projectId, projects.id), isNotNull(versions.publishedAt))),
    ),
  );

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

✅ Use transactions for multi-step operations
✅ Define proper indexes for performance
✅ Use TypeScript types from schema
✅ Validate input with Zod schemas
✅ Handle database errors properly
✅ Use connection pooling
✅ Test migrations locally first
✅ Use parameterized queries
✅ Export inferred types

### Don'ts

❌ Modify existing migrations
❌ Use raw SQL without parameterization
❌ Skip transaction for related operations
❌ Ignore foreign key constraints
❌ Use synchronous database operations
❌ Store sensitive data unencrypted
❌ Skip index on foreign keys
❌ Use SELECT \* in production
❌ Ignore connection limits
