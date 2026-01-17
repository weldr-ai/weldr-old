# Server

Backend API server for **Weldr**. Built with **Bun**, **ORPC**, **Better-Auth**, **Sentry**, **OpenTelemetry**, and **Pino**.

## 🎯 Responsibilities

The server handles all backend functionality:

- **API Layer**: Type-safe API endpoints for the web application via ORPC
- **Project Management**: Manage projects, branches, snapshots, and versions
- **Code Generation**: Orchestrate AI agents for code generation and editing
- **Integration System**: Handle integrations for auth, database, backend, and frontend
- **Data Persistence**: Store projects, branches, snapshots, declarations, and user data
- **Authentication**: Handle user authentication and authorization
- **Semantic Graph**: Maintain declarations, call graphs, and semantic relationships
- **Background Jobs**: Process code analysis, generate declarations, and update semantic graphs

## 🚀 Tech Stack

- **Runtime**: [Bun](https://bun.sh) - Fast JavaScript runtime
- **API**: [ORPC](https://orpc.dev) - Type-safe RPC framework
- **Authentication**: [Better-Auth](https://www.better-auth.com) - Type-safe authentication
- **Database**: [Drizzle ORM](https://orm.drizzle.team) with PostgreSQL
- **Error Tracking**: [Sentry](https://sentry.io) - Error tracking and performance monitoring
- **Observability**: [OpenTelemetry](https://opentelemetry.io) - Distributed tracing
- **Log Aggregation**: [Axiom](https://axiom.co) - Log aggregation and analytics
- **Logging**: [Pino](https://getpino.io) - Fast structured logging

## 📦 Installation

```bash
bun install
```

## 🛠️ Development

```bash
# Start development server with watch mode
bun run dev

# The server will automatically reload on file changes
```

## 🏗️ Building

```bash
# Build for production
bun run build

# Start production server
bun run start
```

## 🗄️ Database

The server uses PostgreSQL with Drizzle ORM. Database operations:

```bash
# Generate migrations from schema changes
bun run db:generate

# Run migrations
bun run db:migrate

# Push schema changes directly (dev only)
bun run db:push

# Pull schema from database
bun run db:pull

# Open Drizzle Studio (database GUI)
bun run db:studio
```

## 🔐 Authentication

Better-Auth is configured with:

- Drizzle adapter for database operations
- PostgreSQL for session and user storage
- Server-side authentication endpoints at `/api/auth`

## 📊 Observability

### Sentry

Sentry is configured in `instrument.server.ts` and automatically imported when the server starts. It provides:

- Error tracking and reporting
- Performance monitoring
- Distributed tracing

### OpenTelemetry

OpenTelemetry is integrated with Sentry for:

- Distributed tracing across services
- Instrumentation of ORPC procedures
- Trace export to Sentry

### Logging

Pino is used for structured logging:

- Fast JSON logging
- Integration with OpenTelemetry
- **Axiom integration**: Logs are automatically sent to Axiom via `@axiomhq/pino` transport

## 🏗️ Project Structure

```
server/
├── src/
│   ├── lib/             # Server utilities (env, handlers, logger)
│   ├── index.ts         # App entry point
│   └── server.ts        # Server entry point
├── instrument.server.ts # Sentry instrumentation
└── tsdown.config.ts     # Build configuration

Note: The ORPC router, procedures, and middlewares are defined in `packages/api_v2/`
```

## 🔧 Configuration

### Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `SENTRY_DSN` - Sentry DSN for error tracking
- `BETTER_AUTH_SECRET` - Secret key for Better-Auth
- `BETTER_AUTH_URL` - Base URL for Better-Auth

## 📝 Type Checking

```bash
# Run TypeScript type checking
bun run typecheck
```

## 🧪 Testing

Tests can be added using your preferred testing framework (Vitest, Bun's built-in test runner, etc.).

## 📖 Related Documentation

- [Bun Documentation](https://bun.sh/docs)
- [ORPC Documentation](https://orpc.dev)
- [Better-Auth Documentation](https://www.better-auth.com/docs)
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
- [Sentry Documentation](https://docs.sentry.io)
