# `@weldr/db`

Database schema and utilities for the Weldr platform using Drizzle ORM.

## Overview

This package provides the database schema, migrations, and utilities for Weldr. It uses Drizzle ORM with PostgreSQL and includes schemas for projects, branches, versions, chats, integrations, declarations, and more.

## Installation

This package is part of the Weldr monorepo and uses workspace protocol:

```json
{
  "dependencies": {
    "@weldr/db": "workspace:*"
  }
}
```

## Usage

### Database Connection

```typescript
import { db } from "@weldr/db";

const projects = await db.query.projects.findMany();
```

### Schema Exports

```typescript
import {
  projects,
  branches,
  versions,
  chats,
  integrations,
  declarations,
  // ... other schemas
} from "@weldr/db/schema";
```

### Query Examples

```typescript
import { db, eq } from "@weldr/db";
import { projects } from "@weldr/db/schema";

// Find project by ID
const project = await db.query.projects.findFirst({
  where: eq(projects.id, projectId),
});

// Find with relations
const project = await db.query.projects.findFirst({
  where: eq(projects.id, projectId),
  with: {
    branches: true,
    integrations: true,
  },
});

// Insert
await db.insert(projects).values({
  id: nanoid(),
  name: "My Project",
  userId: userId,
});

// Update
await db
  .update(projects)
  .set({ name: "Updated Name" })
  .where(eq(projects.id, projectId));

// Delete
await db.delete(projects).where(eq(projects.id, projectId));
```

### Transactions

```typescript
import { db } from "@weldr/db";

await db.transaction(async (tx) => {
  await tx.insert(projects).values({ /* ... */ });
  await tx.insert(branches).values({ /* ... */ });
});
```

## Schemas

### Core Schemas

- `projects` - Project information
- `branches` - Branch information
- `versions` - Version information
- `chats` - Chat conversations
- `chatMessages` - Chat messages

### Integration Schemas

- `integrations` - Installed integrations
- `integrationTemplates` - Available integration templates
- `integrationCategories` - Integration categories

### Declaration Schemas

- `declarations` - Code declarations
- `declarationTemplates` - Declaration templates

### Other Schemas

- `environmentVariables` - Environment variables
- `nodes` - Architecture nodes
- `themes` - UI themes
- `aiModels` - AI model configurations
- `tasks` - Task tracking
- `vault` - Secure storage
- `dependencies` - Package dependencies

## Migrations

### Generate Migration

```bash
bun db:generate
```

### Run Migrations

```bash
bun db:migrate
```

### Push Schema Changes

```bash
bun db:push
```

### Drizzle Studio

Open Drizzle Studio to view and edit database:

```bash
bun db:studio
```

## Type Safety

All schemas are fully typed with TypeScript:

```typescript
import type { projects } from "@weldr/db/schema";

type Project = typeof projects.$inferSelect;
type NewProject = typeof projects.$inferInsert;
```

## Exports

- `db` - Drizzle database instance
- `*` - All Drizzle ORM exports (eq, and, or, etc.)
- Schema exports from `./schema`

## Related Packages

- `@weldr/shared` - Shared validators and types
- `@weldr/api` - API layer using this database
