# Agent Application Development Guidelines

## Overview

The Agent application is the core AI-powered backend service built with Hono and OpenAPI. It handles code generation, project planning, and integration management using LLMs with custom tools.

## Current Structure

- `src/ai`: agents (planner, coder), prompts, schemas, tools, shared utils
- `src/routes`: health, trigger, stream, revert, install-integrations (Hono OpenAPI routes)
- `src/workflow`: engine, context, steps (generate-project-info, generate-branch-name, generate-version-details, planning, coding, finalizing)
- `src/integrations`: authentication (better-auth), backend (orpc), frontend (tanstack-start), database (postgresql), utils (registry, queue-manager/installer, declaration templates, env writer)
- `src/lib`: git/worktrees, branch-state, build, commands runner, constants, extract-declarations, storage, stream-utils, misc utils
- `src/middlewares`: logger middleware for request logging

## Type Safety Requirements

### Hono OpenAPI Routes

```typescript
// ALWAYS define routes with proper Zod schemas
import { createRoute, z } from "@hono/zod-openapi";
import { createRouter } from "@/lib/utils";

const route = createRoute({
  method: "post",
  path: "/api/resource",
  summary: "Create resource",
  description: "Detailed description",
  tags: ["Resources"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            name: z.string(),
            value: z.number(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Success",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string(),
            created: z.boolean(),
          }),
        },
      },
    },
    400: {
      description: "Bad request",
    },
  },
});

const router = createRouter();

router.openapi(route, async (c) => {
  const body = c.req.valid("json");
  // Type-safe body access
  return c.json({ id: "123", created: true });
});
```

### Tool Development

```typescript
// ALWAYS use createTool utility with proper schemas
import { z } from "zod";
import { createTool } from "./utils";
import { exec } from "@/lib/sandbox";

export const myTool = createTool({
  name: "toolName",
  description: "Clear description of what the tool does",
  whenToUse: "When you need to perform specific action",
  inputSchema: z.object({
    param1: z.string().describe("Description of parameter"),
    param2: z.number().optional().describe("Optional parameter"),
  }),
  outputSchema: z.discriminatedUnion("success", [
    z.object({
      success: z.literal(true),
      data: z.string(),
    }),
    z.object({
      success: z.literal(false),
      error: z.string(),
    }),
  ]),
  execute: async ({ input, context }) => {
    // Get context data
    const project = context.get("project");
    const branch = context.get("branch");

    // Initialize logger with context
    const logger = Logger.get({
      projectId: project.id,
      versionId: branch.headVersion.id,
      input,
    });

    try {
      // Tool implementation - use exec() for commands inside agentfs session
      // All commands run in the virtual /workspace directory
      const result = await exec("some-command", {
        projectId: project.id,
        branchId: branch.id,
      });

      return {
        success: true as const,
        data: result.stdout,
      };
    } catch (error) {
      logger.error("Tool execution failed", { extra: { error } });
      return {
        success: false as const,
        error: error.message,
      };
    }
  },
});
```

### Tool Schema Patterns

```typescript
// ALWAYS use discriminated unions for output schemas
outputSchema: z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    // Success properties
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
  }),
]);

// Use descriptive schemas for better AI understanding
inputSchema: z.object({
  path: z.string().describe("The file path to read"),
  encoding: z.enum(["utf-8", "ascii"]).optional().default("utf-8"),
});
```

### Message Handling

- **ALWAYS** validate message content with Zod schemas
- Use proper message role types: 'user' | 'assistant' | 'system'
- Validate attachments and metadata
- Type message content arrays properly

### Stream Processing

```typescript
// ALWAYS use proper types for SSE streams
interface StreamEvent {
  type: "chunk" | "error" | "done";
  data: unknown; // Validate with schema
}

// ALWAYS handle stream errors
stream.on("error", (error: Error) => {
  // Proper error handling
});
```

## Logging Standards

### Mandatory Logger Usage

- **NEVER** use `console.log`, `console.error`, `console.warn`, or any console methods
- **ALWAYS** use the Logger from `@weldr/shared` package for all logging needs
- **USE** structured logging with appropriate context data
- **IMPLEMENT** proper log levels: debug, info, warn, error, fatal, trace

### Logger Import and Basic Usage

```typescript
import { Logger } from "@weldr/shared";

// Direct logger usage for simple operations
Logger.info("User authentication successful");
Logger.error("Database connection failed", {
  error: err.message,
  connectionString: safeConnectionString,
});
Logger.warn("High memory usage detected", { memoryUsage: process.memoryUsage() });
```

### Contextual Logger for Tools and Operations

```typescript
// In tool implementations - always use Logger.get() for context
export const myTool = createTool({
  // ... tool definition
  execute: async ({ input, context }) => {
    const project = context.get("project");
    const branch = context.get("branch");

    const logger = Logger.get({
      projectId: project.id,
      versionId: branch.headVersion.id,
      toolName: "myTool",
      input: input.someId, // Safe contextual data only
    });

    logger.info("Tool execution started");

    try {
      const result = await performAction(input);
      logger.info("Tool execution completed", {
        extra: {
          resultSize: result.length,
          duration: Date.now() - startTime,
        },
      });
      return { success: true as const, data: result };
    } catch (error) {
      logger.error("Tool execution failed", {
        extra: {
          error: error.message,
          stack: error.stack,
        },
      });
      return { success: false as const, error: error.message };
    }
  },
});
```

### Route-Level Logging

```typescript
router.openapi(route, async (c) => {
  const logger = Logger.get({
    method: c.req.method,
    path: c.req.path,
    requestId: crypto.randomUUID(),
  });

  logger.info("Request started");

  try {
    const result = await someOperation();
    logger.info("Request completed successfully");
    return c.json(result);
  } catch (error) {
    logger.error("Request failed", { extra: { error: error.message } });
    return c.json({ error: "Internal server error" }, 500);
  }
});
```

### Stream and Workflow Logging

```typescript
// In workflow steps
const logger = Logger.get({
  projectId,
  versionId,
  chatId,
  stepName: "codeGeneration",
});

logger.info("Workflow step started");

// In stream processing
const logger = Logger.get({
  streamId,
  chatId,
  operation: "sse-streaming",
});

stream.on("data", (chunk) => {
  logger.debug("Stream chunk processed", { chunkSize: chunk.length });
});

stream.on("error", (error) => {
  logger.error("Stream error occurred", { extra: { error: error.message } });
});
```

### Security-Conscious Logging

```typescript
// DO NOT log sensitive information
const logger = Logger.get({ userId, operation: "payment" });

// ❌ BAD - exposes sensitive data
logger.info("Processing payment", {
  creditCard: "4111-1111-1111-1111",
  password: userInput.password,
});

// ✅ GOOD - logs safe contextual data
logger.info("Processing payment", {
  paymentMethod: "credit_card",
  amount: 100,
  currency: "USD",
});
```

### Performance and Debug Logging

```typescript
const logger = Logger.get({
  operation: "declaration-extraction",
  fileCount: files.length,
});

const startTime = Date.now();
logger.debug("Starting declaration extraction");

const result = await extractDeclarations(files);

logger.info("Declaration extraction completed", {
  extra: {
    duration: Date.now() - startTime,
    declarationCount: result.length,
    filesProcessed: files.length,
  },
});
```

## Hono-Specific Patterns

### Route Organization

```typescript
// In src/routes/[resource].ts
import { createRoute } from "@hono/zod-openapi";
import { createRouter } from "@/lib/utils";

const router = createRouter();

// Define multiple routes in same file
router.openapi(getRoute, async (c) => {
  /* ... */
});
router.openapi(postRoute, async (c) => {
  /* ... */
});
router.openapi(putRoute, async (c) => {
  /* ... */
});
router.openapi(deleteRoute, async (c) => {
  /* ... */
});

export default router;
```

### Authentication in Routes

```typescript
import { auth } from "@weldr/auth";

router.openapi(route, async (c) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Use session.user for authenticated operations
});
```

### Error Handling in Hono

```typescript
import { Logger } from "@weldr/shared";

router.openapi(route, async (c) => {
  const logger = Logger.get({
    method: c.req.method,
    path: c.req.path,
    requestId: crypto.randomUUID(),
  });

  try {
    const result = await someOperation();
    return c.json(result);
  } catch (error) {
    if (error instanceof ValidationError) {
      logger.warn("Validation error occurred", { extra: { error: error.message } });
      return c.json({ error: error.message }, 400);
    }
    if (error instanceof NotFoundError) {
      logger.info("Resource not found", { extra: { error: error.message } });
      return c.json({ error: "Not found" }, 404);
    }
    // Log unexpected errors with full context
    logger.error("Unexpected server error", {
      extra: {
        error: error.message,
        stack: error.stack,
      },
    });
    return c.json({ error: "Internal server error" }, 500);
  }
});
```

### SSE Streaming with Hono

```typescript
router.openapi(streamRoute, async (c) => {
  const stream = await createSSEStream(streamId, chatId);

  return new Response(stream as ReadableStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
```

## AI Agent Guidelines

### Tool Implementation Rules

1. **Single Responsibility**: Each tool does ONE thing well
2. **Input Validation**: ALWAYS use Zod schemas with descriptions
3. **Error Messages**: Provide clear, actionable error messages
4. **Return Types**: Use discriminated unions for success/failure
5. **Context Usage**: Always get project/branch from context
6. **Sandbox Execution**: Use `exec()` from `@/lib/sandbox` for all commands - they run inside the agentfs virtual `/workspace` directory
7. **Logging**: Use structured logging with Logger.get()

### XML Tool Support

```typescript
// Tools support both JSON and XML formats
const tool = myTool(context); // JSON format
const xmlTool = myTool.asXML(context); // XML format
const markdown = myTool.toMarkdown(); // Documentation format
```

### Declaration Extraction

- Use AST parsing for accurate code analysis
- Track dependencies between declarations
- Maintain declaration metadata with proper types
- Use enrichment for additional context

## Integration System

### Adding New Integrations

1. Define integration schema in `/integrations/types.ts`
2. Create category with `defineIntegrationCategory`
3. Implement integration with `defineIntegration`
4. Add to registry with proper typing
5. Validate all configuration with Zod

### Integration Security

- **NEVER** expose API keys in responses
- Store secrets in vault with encryption
- Use environment variable mappings
- Validate integration status before use

## Workflow Engine

### Step Implementation

```typescript
// ALWAYS type workflow steps
interface StepContext {
  projectId: string;
  versionId: string;
  messages: ChatMessage[];
}

export const myStep: WorkflowStep<StepContext> = {
  name: "myStep",
  execute: async (context) => {
    // Type-safe implementation
  },
};
```

### Workflow Context Pattern

```typescript
// Access workflow context in tools
const project = context.get("project");
const branch = context.get("branch");
const chatId = context.get("chatId");
const messages = context.get("messages");
```

## AgentFS Sandbox

### Architecture Overview

All file operations and command execution happen inside an **agentfs session**. The agentfs CLI provides:

- **Virtual `/workspace` directory**: All commands see files at `/workspace`, which is a FUSE-mounted overlay
- **Copy-on-write isolation**: Each branch has its own SQLite database (`~/.agentfs/{branchId}.db`) storing file changes
- **Cloud sync**: Session databases are synced to cloud storage for persistence

### Command Execution

```typescript
// Use exec() from sandbox for all commands
import { exec } from "@/lib/sandbox";

// Commands automatically run in the virtual /workspace directory
const result = await exec("bun install", {
  projectId: project.id,
  branchId: branch.id,
});

if (result.exitCode !== 0) {
  throw new Error(`Command failed: ${result.stderr}`);
}
```

### File Operations

```typescript
// Use sandbox fs utilities for file operations
import { readFile, writeFile, listDir, fileExists } from "@/lib/sandbox/fs";

// Read a file from the virtual workspace
const content = readFile(branchId, "/package.json");

// Write a file to the virtual workspace
writeFile(branchId, "/src/index.ts", "export const foo = 'bar';");

// Check if file exists
if (fileExists(branchId, "/tsconfig.json")) {
  // ...
}

// List directory contents
const files = listDir(branchId, "/src");
```

## Git Operations

### Git Commands in AgentFS

```typescript
// Use Git namespace for all git-related operations
import { Git } from "@/lib/git";

// Initialize git repository (runs inside agentfs session)
await Git.initRepository(projectId, branchId);

// Create git commits
const commitHash = await Git.commit(
  "commit message",
  { name: "Author", email: "author@example.com" },
  projectId,
  branchId,
);

// Get changed files
const changedFiles = await Git.getChangedFiles(projectId, branchId);
```

## OpenAPI Documentation

### Route Documentation Best Practices

```typescript
const route = createRoute({
  method: "post",
  path: "/api/v1/resource",
  summary: "Brief one-line summary",
  description: "Detailed multi-line description explaining the endpoint",
  tags: ["Category"],
  request: {
    params: z.object({
      id: z.string().openapi({
        description: "Resource identifier",
        example: "res_123",
      }),
    }),
    query: z.object({
      limit: z.number().optional().openapi({
        description: "Number of items to return",
        example: 10,
      }),
    }),
    body: {
      content: {
        "application/json": {
          schema: requestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Successful response",
      content: {
        "application/json": {
          schema: responseSchema,
        },
      },
    },
    // Define all possible response codes
  },
});
```

## Testing Guidelines

### Testing Tools

```typescript
describe("ToolName", () => {
  const mockContext = new WorkflowContext({
    project: { id: "test" },
    version: { id: "v1" },
  });

  it("should validate input schema", () => {
    const tool = myTool(mockContext);
    const result = tool.inputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it("should execute successfully", async () => {
    const tool = myTool(mockContext);
    const result = await tool.execute(validInput);
    expect(result.success).toBe(true);
  });
});
```

## Performance Optimization

### Streaming Best Practices

- Use TransformStream for efficient processing
- Implement backpressure handling
- Stream large responses incrementally
- Clean up streams on client disconnect

### Caching Strategy

- Cache declaration extractions
- Use memory cache for frequent lookups
- Implement cache invalidation
- Monitor cache hit rates

## Monitoring & Logging

### Structured Logging

```typescript
import { Logger } from "@weldr/shared/logger";

const logger = Logger.get({
  projectId,
  versionId,
  chatId,
});

logger.info("Operation completed", {
  extra: {
    operationType: "tool_execution",
    toolName: "grep",
    duration: Date.now() - startTime,
  },
});
```

### Metrics to Track

- Tool execution times
- LLM token usage
- Error rates by tool
- Stream processing performance
- Integration success rates

## Security Considerations

### Input Sanitization

- Sanitize all file paths
- Validate command arguments
- Escape shell commands properly
- Prevent code injection
- Use WORKSPACE_DIR for path validation

### Resource Limits

- Set timeout for tool execution
- Limit file operation sizes
- Cap LLM token usage
- Rate limit API endpoints

## Common Patterns

### Tool Registry Pattern

```typescript
// Tools are registered automatically via index.ts
export const tools = {
  grep: grepTool,
  readFile: readFileTool,
  writeFile: writeFileTool,
  // ... other tools
};

// Use in agent
const availableTools = Object.values(tools).map((tool) => tool(context));
```

### Context Propagation

```typescript
// Pass context through operations
interface OperationContext {
  requestId: string;
  userId: string;
  projectId: string;
  startTime: number;
}

// Use context in all operations
async function performOperation(context: OperationContext, input: Input): Promise<Output> {
  // Implementation with context
}
```

## Middleware Usage

### Custom Middleware

```typescript
import { MiddlewareHandler } from "hono";
import { Logger } from "@weldr/shared";

const loggingMiddleware: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  const logger = Logger.get({
    method: c.req.method,
    path: c.req.path,
    requestId: crypto.randomUUID(),
  });

  await next();
  const duration = Date.now() - start;

  logger.info("Request completed", {
    extra: {
      duration,
      statusCode: c.res.status,
      userAgent: c.req.header("user-agent"),
    },
  });
};

router.use(loggingMiddleware);
```

## Debugging Tips

### Tool Debugging

- Log tool inputs and outputs
- Use structured error messages
- Implement tool replay capability
- Add debug mode for verbose output

### Stream Debugging

- Log stream events
- Monitor chunk sizes
- Track stream lifecycle
- Implement stream replay for testing

## Do's and Don'ts

### Do's

✅ Use createTool utility for all tools
✅ Define discriminated unions for tool outputs
✅ Use Hono's OpenAPI for all routes
✅ Validate all inputs with Zod schemas
✅ Use TypeScript strict mode
✅ Handle all error cases explicitly
✅ Stream large responses
✅ Use Logger.get() for structured logging
✅ Use `exec()` from `@/lib/sandbox` for all commands
✅ Use sandbox fs utilities (`readFile`, `writeFile`, etc.) for file operations
✅ Document all API endpoints

### Don'ts

❌ Use `any` type
❌ Create tools without createTool utility
❌ Ignore TypeScript errors
❌ Expose internal errors to users
❌ Block event loop with sync operations
❌ Store secrets in code
❌ Trust user input without validation
❌ Use console.log, console.error, console.warn, or any console methods (use Logger from @weldr/shared)
❌ Skip OpenAPI documentation
❌ Use Node.js `fs` directly for user workspace files (use sandbox fs utilities)
❌ Assume real filesystem paths exist (everything is virtual in agentfs)
