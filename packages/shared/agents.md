# Shared Package Development Guidelines

## Overview
The @weldr/shared package provides shared utilities, types, validators, and integrations used across all packages in the Weldr monorepo. It includes logging, ID generation, Zod validators, and external service integrations (Fly.io, Tigris).

## Type Safety Requirements

### Type Definitions
```typescript
// ALWAYS export explicit types
export interface Project {
  id: string;
  title: string;
  description: string | null;
  subdomain: string;
  userId: string;
}

// Use discriminated unions for variants
export type ChatMessage = UserMessage | AssistantMessage | ToolMessage;

export interface UserMessage {
  role: "user";
  content: string;
  attachments?: Attachment[];
}

export interface AssistantMessage {
  role: "assistant";
  content: string;
  metadata?: AIMetadata;
}

export interface ToolMessage {
  role: "tool";
  content: string;
}
```

### Zod Validators
```typescript
import { z } from "zod";

// Define schemas with proper descriptions
export const projectSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(100),
  description: z.string().nullable(),
  subdomain: z.string().regex(/^[a-z0-9-]+$/),
  userId: z.string(),
});

// Export inferred types
export type Project = z.infer<typeof projectSchema>;

// Create insert/update schemas
export const insertProjectSchema = projectSchema.omit({ id: true });
export const updateProjectSchema = insertProjectSchema.partial();
```

## Logger Usage

### Logger Module
```typescript
import { Logger } from "@weldr/shared/logger";

// Direct logging methods
Logger.info("Operation completed");
Logger.error("Operation failed", { error: err.message });
Logger.warn("High memory usage", { usage: process.memoryUsage() });
Logger.debug("Debug information", { data });
```

### Contextual Logger
```typescript
// Get logger with persistent context
const logger = Logger.get({
  userId: "user_123",
  operation: "payment-processing",
  requestId: crypto.randomUUID(),
});

logger.info("Payment initiated", { amount: 100, currency: "USD" });
logger.error("Payment failed", { reason: "insufficient-funds" });
```

### Log Levels
- `trace` - Detailed tracing information
- `debug` - Debug information for development
- `info` - General operational information
- `warn` - Warning conditions
- `error` - Error conditions
- `fatal` - Critical failures

### Environment Configuration
```bash
# Set log level via environment variable
LOG_LEVEL=debug  # trace, debug, info, warn, error, fatal
```

## Utility Functions

### Nanoid Generation
```typescript
import { nanoid } from "@weldr/shared/nanoid";

// Generate 16-character lowercase alphanumeric ID
const id = nanoid(); // e.g., "a1b2c3d4e5f6g7h8"
```

### String Utilities
```typescript
import { toKebabCase, toSentence, toTitle } from "@weldr/shared/utils";

toKebabCase("camelCase");    // "camel-case"
toSentence("camelCase");     // "camel Case"
toTitle("kebab-case");       // "Kebab Case"
```

### Color Utilities
```typescript
import {
  hexToHsl,
  isValidHex,
  isValidHsl,
  parseHsl,
  toCssVariables,
} from "@weldr/shared/color-utils";

hexToHsl("#ff0000");         // "hsl(0, 100%, 50%)"
isValidHex("#ff0000");       // true
isValidHsl("hsl(0, 100%, 50%)"); // true
parseHsl("hsl(0, 100%, 50%)");   // "0 100% 50%"
```

### Text Processing
```typescript
import { processText, parseReferences } from "@weldr/shared/process-text";

// Parse <Reference /> tags in content
const parts = processText("Check <Reference type='page' id='home' /> page");
// Returns: [{ type: 'text', content: 'Check ' }, { type: 'reference', ... }, ...]
```

## State Management

### Workspace Utilities
```typescript
import {
  isLocalMode,
  isCloudMode,
  WORKSPACE_DIR,
  getProjectDir,
  getBranchDir,
  initializeWorkspace,
} from "@weldr/shared/state";

// Check environment mode
if (isLocalMode()) {
  // Local development: ~/.weldr
} else {
  // Cloud deployment: /workspace
}

// Get workspace paths
const projectDir = getProjectDir("project_123");
const branchDir = getBranchDir("project_123", "branch_456");

// Initialize workspace directory
await initializeWorkspace();
```

## Fly.io Integration

### App Operations
```typescript
import { Fly } from "@weldr/shared/fly";

// Create app with network and IP
const app = await Fly.app.create("my-app", {
  org_slug: "weldr",
  network: "default",
});

// Get app by project ID
const app = await Fly.app.get(projectId, "preview");

// Generate deploy token
const token = await Fly.app.deployToken(appName);

// Destroy app
await Fly.app.destroy(appName);
```

### Machine Operations
```typescript
// Create machine with presets
const machine = await Fly.machine.create(
  appName,
  Fly.machine.presets.development,
  region,
);

// Create development machine with volume
const { machine, volume } = await Fly.machine.createWithVolume(
  appName,
  volumeConfig,
);

// List machines
const machines = await Fly.machine.list(appName);

// Start/destroy machine
await Fly.machine.start(appName, machineId);
await Fly.machine.destroy(appName, machineId);
```

### Secret Operations
```typescript
// Create secrets
await Fly.secret.create(appName, {
  DATABASE_URL: "postgres://...",
  API_KEY: "secret_key",
});

// Delete secrets
await Fly.secret.delete(appName, ["DATABASE_URL", "API_KEY"]);
```

### Volume Operations
```typescript
// Create volume
const volume = await Fly.volume.create(appName, {
  name: "data",
  size_gb: 10,
  region: "ord",
});

// Destroy volume
await Fly.volume.destroy(appName, volumeId);
```

## Tigris Storage Integration

### Bucket Operations
```typescript
import { Tigris } from "@weldr/shared/tigris";

// Create bucket
await Tigris.bucket.create(bucketName);

// Delete bucket
await Tigris.bucket.delete(bucketName);
```

### Credentials Management
```typescript
// Create credentials with IAM policy
const credentials = await Tigris.credentials.create(projectId, bucketName);
// Returns: { accessKeyId, secretAccessKey }

// Delete credentials
await Tigris.credentials.delete(projectId);
```

### Signed URLs
```typescript
// Generate presigned URL for object
const url = await Tigris.object.getSignedUrl(bucketName, objectKey, {
  expiresIn: 3600, // seconds
});
```

## Validator Organization

### File Structure
```
src/validators/
├── auth.ts              # Authentication schemas
├── branches.ts          # Branch schemas
├── chats.ts             # Chat/message schemas
├── dependencies.ts      # Dependency schemas
├── environment-variables.ts
├── integrations.ts      # Integration schemas
├── integration-templates.ts
├── integration-categories.ts
├── json-schema.ts       # JSON Schema utilities
├── nodes.ts             # Node schemas
├── openapi.ts           # OpenAPI validators
├── packages.ts          # Package schemas
├── plans.ts             # Plan/task schemas
├── projects.ts          # Project schemas
├── themes.ts            # Theme schemas
├── vault.ts             # Vault schemas
├── versions.ts          # Version schemas
└── declarations/
    ├── index.ts
    ├── v1.ts
    ├── db-model.ts
    ├── endpoint.ts
    └── page.ts
```

### Validator Patterns
```typescript
// Base entity schema
export const projectSchema = z.object({
  id: z.string(),
  title: z.string(),
  userId: z.string(),
  createdAt: z.date(),
});

// Insert schema (omit auto-generated fields)
export const insertProjectSchema = projectSchema.omit({
  id: true,
  createdAt: true,
});

// Update schema (all fields optional)
export const updateProjectSchema = insertProjectSchema.partial();

// Export types
export type Project = z.infer<typeof projectSchema>;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type UpdateProject = z.infer<typeof updateProjectSchema>;
```

## Type Definitions

### Main Types Export
```typescript
// @weldr/shared/types
export type {
  Project,
  Branch,
  Version,
  ChatMessage,
  UserMessage,
  AssistantMessage,
  ToolMessage,
  Attachment,
  EnvironmentVariable,
  Node,
  NodeType,
  Theme,
  Plan,
  Task,
  Integration,
  IntegrationKey,
  TStatus,
};
```

### SSE/Streaming Types
```typescript
export type SSEValue =
  | TextStreamableValue
  | ReasoningStreamableValue
  | ToolCallStreamableValue
  | NodeStreamableValue
  | ProjectStreamableValue
  | BranchStreamableValue
  | SSEConnectionEvent
  | SSEErrorEvent
  | SSEStatusEvent;

export interface SSEEvent {
  id: string;
  data: SSEValue;
}
```

### Declaration Types
```typescript
export type DeclarationProgress =
  | "pending"
  | "in_progress"
  | "enriching"
  | "completed";

export interface DeclarationMetadata {
  code: DeclarationCodeMetadata;
  semantic: DeclarationSemanticMetadata;
  specs: DeclarationSpecs;
}
```

## Package Exports

```json
{
  "exports": {
    "./utils": "./src/utils.ts",
    "./validators/*": "./src/validators/*.ts",
    "./types": "./src/types/index.ts",
    "./types/declarations": "./src/types/declarations.ts",
    "./fly": "./src/fly/index.ts",
    "./tigris": "./src/tigris.ts",
    "./color-utils": "./src/color-utils.ts",
    "./nanoid": "./src/nanoid.ts",
    "./logger": "./src/logger.ts",
    "./process-text": "./src/process-text.ts",
    "./state": "./src/state/index.ts"
  }
}
```

## Dependencies

### Runtime Dependencies
- `zod` - Runtime validation
- `pino` - Structured logging
- `nanoid` - ID generation
- `ofetch` - HTTP fetch library
- `@aws-sdk/client-iam` - AWS IAM for Tigris
- `@tigrisdata/storage` - Tigris S3 storage

### Dev Dependencies
- `pino-pretty` - Pretty logging for development

## Do's and Don'ts

### Do's
- Export explicit TypeScript types
- Use Zod schemas for all validators
- Use Logger instead of console methods
- Use nanoid for ID generation
- Create insert/update schema variants
- Document schema fields with `.describe()`
- Use discriminated unions for variants
- Check `isLocalMode()` before cloud operations

### Don'ts
- Use `any` type
- Use `console.log` or other console methods
- Create validators without type exports
- Hardcode IDs or secrets
- Skip validation on external data
- Use synchronous file operations
- Expose sensitive data in logs
- Create circular dependencies
