# `@weldr/shared`

Shared utilities, types, validators, and state management for the Weldr platform.

## Overview

This package provides shared functionality used across the Weldr monorepo, including utilities, TypeScript types, Zod validators, logging, state management, and integrations with external services.

## Installation

This package is part of the Weldr monorepo and uses workspace protocol:

```json
{
  "dependencies": {
    "@weldr/shared": "workspace:*"
  }
}
```

## Exports

### Utilities

```typescript
import { toKebabCase, toSentence, toTitle } from "@weldr/shared/utils";
```

### Validators

```typescript
import { insertProjectSchema, updateProjectSchema } from "@weldr/shared/validators/projects";
```

### Types

```typescript
import type { Declaration } from "@weldr/shared/types/declarations";
import type { Project } from "@weldr/shared/types";
```

### Logger

```typescript
import { Logger } from "@weldr/shared/logger";

// Direct usage
Logger.info("User authenticated");
Logger.error("Database error", { userId: "123" });

// Contextual logger
const logger = Logger.get({ userId: "123", operation: "payment" });
logger.info("Payment processed");
```

### State Management

```typescript
import { isLocalMode, isCloudMode, initializeWorkspace } from "@weldr/shared/state";
```

### Nanoid

```typescript
import { nanoid } from "@weldr/shared/nanoid";

const id = nanoid();
```

### Fly.io Integration

```typescript
import { Fly } from "@weldr/shared/fly";

const appId = await Fly.app.create({
  type: "production",
  projectId: "123",
});
```

### Tigris Integration

```typescript
import { Tigris } from "@weldr/shared/tigris";

const bucket = await Tigris.getBucket("my-bucket");
```

### Text Processing

```typescript
import { processText } from "@weldr/shared/process-text";
```

### Color Utilities

```typescript
import { colorUtils } from "@weldr/shared/color-utils";
```

## Usage Examples

### Validators

```typescript
import { insertProjectSchema } from "@weldr/shared/validators/projects";
import { z } from "zod";

const projectData = insertProjectSchema.parse({
  name: "My Project",
  userId: "user123",
});
```

### Logger

```typescript
import { Logger } from "@weldr/shared/logger";

try {
  await someOperation();
  Logger.info("Operation successful");
} catch (error) {
  Logger.error("Operation failed", {
    error: error.message,
    operation: "someOperation",
  });
}
```

### State Management

```typescript
import { isLocalMode, isCloudMode, initializeWorkspace } from "@weldr/shared/state";

// Check environment mode
if (isLocalMode()) {
  // Local development
}

// Initialize local workspace for state files
await initializeWorkspace();
```

### Nanoid

```typescript
import { nanoid } from "@weldr/shared/nanoid";

const projectId = nanoid();
const branchId = nanoid();
```

## Available Validators

- `projects` - Project validators
- `branches` - Branch validators
- `versions` - Version validators
- `chats` - Chat validators
- `integrations` - Integration validators
- `declarations` - Declaration validators
- `environmentVariables` - Environment variable validators
- And more...

## Type Definitions

- `types/index.ts` - Main type exports
- `types/declarations.ts` - Declaration types

## Logging Levels

- `trace` - Detailed tracing information
- `debug` - Debug information
- `info` - General information
- `warn` - Warning messages
- `error` - Error messages
- `fatal` - Fatal errors

## Related Packages

- `@weldr/db` - Database schema (uses validators)
- `@weldr/api` - API layer (uses validators and types)
