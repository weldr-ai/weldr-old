# `@weldr/api`

Type-safe tRPC API layer for the Weldr platform.

## Overview

This package provides a type-safe API layer using tRPC, enabling full type inference between client and server. It includes routers for projects, chats, branches, versions, integrations, declarations, environment variables, nodes, and themes.

## Installation

This package is part of the Weldr monorepo and uses workspace protocol:

```json
{
  "dependencies": {
    "@weldr/api": "workspace:*"
  }
}
```

## Usage

### Server-Side

```typescript
import { appRouter, createTRPCContext } from "@weldr/api";

const context = createTRPCContext({
  /* ... */
});
const caller = appRouter.createCaller(context);

const projects = await caller.projects.list();
```

### Client-Side

```typescript
import { api } from "@/lib/trpc/react";

function MyComponent() {
  const { data: projects } = api.projects.list.useQuery();
  const createProject = api.projects.create.useMutation();

  return (
    <div>
      {projects?.map((project) => (
        <div key={project.id}>{project.name}</div>
      ))}
    </div>
  );
}
```

## Routers

### Projects Router

- `projects.create` - Create a new project
- `projects.list` - List all projects
- `projects.get` - Get project by ID
- `projects.update` - Update project
- `projects.delete` - Delete project

### Chats Router

- `chats.create` - Create a new chat
- `chats.list` - List chats for a project
- `chats.get` - Get chat by ID
- `chats.update` - Update chat

### Branches Router

- `branches.create` - Create a new branch
- `branches.list` - List branches for a project
- `branches.get` - Get branch by ID
- `branches.update` - Update branch

### Versions Router

- `versions.list` - List versions for a branch
- `versions.get` - Get version by ID
- `versions.create` - Create a new version

### Integrations Router

- `integrations.list` - List integrations for a project
- `integrations.install` - Install an integration
- `integrations.uninstall` - Uninstall an integration
- `integrations.get` - Get integration by ID

### Integration Templates Router

- `integrationTemplates.list` - List available integration templates
- `integrationTemplates.get` - Get integration template by ID

### Declarations Router

- `declarations.list` - List declarations for a project
- `declarations.get` - Get declaration by ID
- `declarations.query` - Query related declarations

### Environment Variables Router

- `environmentVariables.list` - List environment variables for a project
- `environmentVariables.create` - Create environment variable
- `environmentVariables.update` - Update environment variable
- `environmentVariables.delete` - Delete environment variable

### Nodes Router

- `nodes.list` - List nodes for a project
- `nodes.get` - Get node by ID

### Themes Router

- `themes.list` - List themes
- `themes.get` - Get theme by ID

## Type Safety

All routers provide full TypeScript type inference:

```typescript
import type { RouterInputs, RouterOutputs } from "@weldr/api";

type ProjectListInput = RouterInputs["projects"]["list"];
type ProjectListOutput = RouterOutputs["projects"]["list"];
```

## Authentication

Most procedures require authentication via `protectedProcedure`. The context includes the authenticated user session.

## Error Handling

Errors are handled using `TRPCError` with appropriate error codes:

- `UNAUTHORIZED` - Authentication required
- `NOT_FOUND` - Resource not found
- `BAD_REQUEST` - Invalid request
- `INTERNAL_SERVER_ERROR` - Server error

## Exports

- `appRouter` - Main tRPC router
- `createTRPCContext` - Context creator function
- `createCaller` - Server-side caller factory
- `RouterInputs` - Type helper for input types
- `RouterOutputs` - Type helper for output types

## Related Packages

- `@weldr/db` - Database schema and utilities
- `@weldr/shared` - Shared validators and types
