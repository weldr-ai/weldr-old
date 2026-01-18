# Server Application Guidelines

Backend API server for **Weldr**. Built with Bun, ORPC, Drizzle, and Better-Auth.

## Responsibilities

The server app is a simple runtime that:

- Runs the ORPC API from `@weldr/api`
- Handles HTTP requests and responses
- Provides server configuration and environment setup
- Manages logging and observability

**Note**: All API routes are defined in `packages/api_v2`. The server app only runs the API, nothing else.

## Tech Stack

- **Runtime**: Bun
- **API**: ORPC (type-safe RPC)
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: Better-Auth (server)
- **Error Tracking**: Sentry
- **Tracing**: OpenTelemetry
- **Log Aggregation**: Axiom
- **Logging**: Pino

## Commands

```bash
bun run dev         # Start with watch mode
bun run build       # Build for production
bun run start       # Start production server
bun run db:generate # Generate migrations
bun run db:migrate  # Run migrations
bun run db:push     # Push schema (dev only)
bun run db:studio   # Open Drizzle Studio
```

## File Structure

````
src/
├── lib/
│   ├── env.ts          # Environment variables
│   ├── handlers.ts     # ORPC handlers (imported from @weldr/api)
│   └── logger.ts       # Pino logger
├── index.ts            # App entry point (exports fetch handler)
└── server.ts           # Server entry point (Bun.serve)

**Note**:
- All API routes are defined in `packages/api_v2/src/router/`
- Database schema is in `packages/db/src/schema/`
- Auth config is in `packages/auth/src/index.tsx`

## API Routes

All API routes are defined in `packages/api_v2`. See `packages/api_v2/agents.md` for detailed documentation on:
- Creating new routes
- Using procedures (public/protected)
- Authentication
- Database operations
- Error handling
- Input validation

## Creating New Routes

**Note**: Routes are created in the `@weldr/api` package, not in the server app. The server app only runs the API. See `packages/api_v2/agents.md` for instructions on creating new routes.

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
````

## Agent Autonomy

### DO Automatically

- **Run linter after EVERY file change** - fix all errors before proceeding
- **Use full TypeScript types** - never use `any`, always properly type everything
- Keep server app minimal - it only runs the API
- Import handlers from `@weldr/api`
- Use proper logging with Pino
- Handle environment variables correctly

### DO NOT Without Asking

- Create new API routes (do this in `packages/api_v2`)
- Change database schema (create migration files)
- Add new middleware (do this in `packages/api_v2`)
- Modify auth configuration
- Change the router structure (do this in `packages/api_v2`)
- Add external API integrations
- Create new environment variables

### After Every Code Change

1. **Check linter** - run and fix ALL errors before moving on
2. **Verify types** - ensure no `any` types anywhere

## Quick Reference

| Task             | How To                                                 |
| ---------------- | ------------------------------------------------------ |
| Import handlers  | `import { createHandlers } from "@weldr/api/handlers"` |
| Get logger       | `import { logger } from "@/lib/logger"`                |
| Environment vars | `import { env } from "@/lib/env"`                      |
| Start server     | `Bun.serve({ port, fetch })`                           |
