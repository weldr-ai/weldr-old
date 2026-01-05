# Weldr Monorepo Development Guidelines

## Project Overview
Weldr is a TypeScript-based monorepo using bun workspaces, Turbo, and modern web technologies. The project consists of AI-powered web applications with a focus on code generation, project management, and integrations.

## Core Principles

### 1. Type Safety is Non-Negotiable
- **ALWAYS** use TypeScript with strict mode enabled
- **NEVER** use `any` type - use `unknown` and proper type guards instead
- **NEVER** use non-null assertions (`!`) - handle null/undefined cases explicitly
- **ALWAYS** define explicit return types for functions
- **ALWAYS** use Zod schemas for runtime validation of external data
- **PREFER** type inference where it maintains clarity
- **ALWAYS** use `satisfies` operator for const assertions with type checking
- **ALWAYS** use branded types for IDs and sensitive data
- **PREFER** union types over enums for better type safety
- **USE** `as const` assertions for immutable data structures

### 2. Code Organization & Architecture
- Follow the existing monorepo structure strictly
- Apps in `/apps`, shared packages in `/packages`
- Use workspace protocol for internal dependencies: `workspace:*`
- Maintain clear separation of concerns between packages
- **APPLY** single responsibility principle when functions or components become very complicated
- **GROUP** related functionality into cohesive modules
- **AVOID** circular dependencies between packages
- **USE** barrel exports (`index.ts`) for clean public APIs
- **ORGANIZE** files by feature, not by type

### 2.1. Code Reusability & Inspection Before Implementation
- **ALWAYS** search and inspect existing code before implementing new functionality
- **NEVER** assume functions, utilities, or components don't exist - always check first
- **REUSE** existing functions, utilities, and components whenever possible
- **READ** function signatures and parameters carefully before using any existing code
- **INSPECT** how existing similar functionality is implemented and follow the same patterns
- **CHECK** the codebase for existing solutions before writing new code
- **EXTRACT** common functionality into reusable utilities when patterns emerge
- **CONSOLIDATE** duplicate code by creating shared functions or components
- **PREFER** extending existing functionality over creating parallel implementations
- **VALIDATE** that your implementation follows existing architectural patterns

### 3. Import Organization & Dependencies
- Follow Biome import organization rules (already configured)
- Order: Node builtins → External packages → @weldr packages → Relative imports
- Use blank lines to separate import groups
- **PREFER** named imports over default imports for better tree-shaking
- **AVOID** importing entire libraries when only specific functions are needed
- **USE** type-only imports for TypeScript types: `import type { ... }`
- **KEEP** dependencies minimal - question every new dependency

### 4. Error Handling & Resilience
- **ALWAYS** use try-catch blocks for async operations
- **ALWAYS** handle errors explicitly - no silent failures
- Use TRPCError for API errors with appropriate codes
- Log errors before re-throwing or handling
- **NEVER** expose sensitive information in error messages
- **IMPLEMENT** circuit breakers for external service calls
- **USE** Result types for operations that can fail gracefully
- **PROVIDE** meaningful error messages that help users understand what went wrong
- **IMPLEMENT** retry logic with exponential backoff for transient failures
- **VALIDATE** error boundaries in React components

### 5. Database & Data Access Excellence
- Use Drizzle ORM for all database operations
- **ALWAYS** use transactions for multi-step operations
- **ALWAYS** validate input with Zod schemas before database operations
- Use prepared statements and parameterized queries
- **NEVER** concatenate SQL strings directly
- **INDEX** foreign keys and frequently queried columns
- **USE** connection pooling with appropriate limits
- **IMPLEMENT** database migrations with rollback strategies
- **MONITOR** query performance and optimize slow queries
- **CACHE** expensive queries appropriately
- **USE** read replicas for read-heavy operations when available

### 6. Performance & Optimization
- **IMPLEMENT** lazy loading for large components and routes
- **USE** React.memo, useMemo, and useCallback judiciously
- **OPTIMIZE** bundle size with code splitting
- **IMPLEMENT** efficient pagination for large datasets
- **USE** streaming for real-time data updates
- **CACHE** API responses with appropriate TTL
- **MINIMIZE** re-renders through proper state management
- **PROFILE** performance bottlenecks regularly
- **OPTIMIZE** images with proper formats and sizes
- **USE** CDN for static assets

### 7. Security Best Practices
- **NEVER** commit secrets, API keys, or credentials
- Use environment variables for configuration
- **ALWAYS** validate and sanitize user input
- Use proper authentication checks (protectedProcedure)
- Implement rate limiting for public endpoints
- **ENCRYPT** sensitive data at rest
- **USE** HTTPS for all communications
- **IMPLEMENT** CORS policies appropriately
- **VALIDATE** file uploads for type and size
- **ESCAPE** user input to prevent XSS
- **USE** parameterized queries to prevent SQL injection
- **IMPLEMENT** proper session management
- **AUDIT** dependencies for security vulnerabilities regularly

### 8. Logging Standards
- **NEVER** use `console.log`, `console.error`, or any console methods in backend code
- **ALWAYS** use the Logger from `@weldr/shared` package for all logging needs
- **USE** structured logging with appropriate context data
- **IMPLEMENT** proper log levels: debug, info, warn, error, fatal, trace

#### Logger Usage Examples:
```typescript
// Import the Logger namespace from shared package
import { Logger } from "@weldr/shared";

// Direct logger usage for simple logging
Logger.info("User authenticated successfully");
Logger.error("Database connection failed", { userId: "123", error: err.message });

// Get contextual logger instance for operations requiring extra metadata
const logger = Logger.get({ userId: "123", operation: "payment-processing" });
logger.info("Payment initiated", { amount: 100, currency: "USD" });
logger.error("Payment failed", { reason: "insufficient-funds" });
```

#### Logging Best Practices:
- **INCLUDE** relevant context data as second parameter
- **USE** descriptive log messages that explain what happened
- **AVOID** logging sensitive information (passwords, tokens, personal data)
- **PREFER** Logger.get() for operations requiring consistent context
- **USE** appropriate log levels based on severity
- **LOG** errors before re-throwing them
- **INCLUDE** operation identifiers for traceability

### 9. Code Quality & Maintainability
- **WRITE** self-documenting code with clear variable and function names
- **KEEP** functions small and focused (max 20-30 lines)
- **AVOID** deep nesting (max 3 levels)
- **USE** early returns to reduce complexity
- **EXTRACT** magic numbers and strings into named constants
- **PREFER** composition over inheritance
- **IMPLEMENT** consistent naming conventions across the codebase
- **REFACTOR** code regularly to reduce technical debt
- **REMOVE** dead code and unused imports regularly

### 9.1. Style Consistency & Pattern Matching
- **MIMIC** existing code style and patterns when implementing new features
- **OBSERVE** how similar functionality is structured in the codebase
- **FOLLOW** existing naming conventions for variables, functions, and files
- **MATCH** the code organization patterns used in similar modules
- **ADOPT** the same error handling patterns used throughout the codebase
- **REPLICATE** existing import/export patterns and file structure
- **MAINTAIN** consistency with existing utility function signatures and usage
- **PRESERVE** the architectural patterns established in each package
- **STUDY** existing implementations to understand the preferred approach
- **ALIGN** with established patterns for API design, component structure, and data flow

### 10. Monitoring & Observability
- **IMPLEMENT** structured logging with appropriate log levels
- **TRACK** key business metrics and KPIs
- **MONITOR** application performance and errors
- **SET UP** alerts for critical failures
- **USE** distributed tracing for complex operations
- **MEASURE** user experience metrics
- **IMPLEMENT** health checks for all services
- **LOG** user actions for analytics and debugging
- **MONITOR** resource usage and scaling metrics

## Technology Stack

### Core Technologies
- **Runtime**: Node.js >= 20
- **Package Manager**: bun 1.3.5
- **Build System**: Turbo
- **Language**: TypeScript 5.7.2
- **Linter/Formatter**: Biome 2.1.1

### Backend
- **API**: tRPC with type-safe routers
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Better Auth
- **Validation**: Zod schemas

### Frontend
- **Framework**: Next.js (web app), TanStack Start
- **UI Components**: Custom UI package with shadcn/ui
- **Styling**: Tailwind CSS
- **State Management**: React Query (TanStack Query)

### AI/Agent System
- **LLM Integration**: Custom AI agents for code generation
- **Tools**: File operations, code search, package management
- **Streaming**: Server-sent events for real-time updates

## Package-Specific Guidelines

### @weldr/db
- Define all schemas with proper TypeScript types
- Use Zod for runtime validation
- Export both schema and validator from same module
- Maintain migration files properly

### @weldr/api
- Each router should have dedicated file
- Use protectedProcedure for authenticated routes
- Return consistent error responses
- Implement proper pagination where needed

### @weldr/ui
- Components must be fully typed with proper props interfaces
- Use forwardRef for components that need ref forwarding
- Maintain consistent styling with Tailwind classes
- Export all icons from central index

### @weldr/shared
- Place all shared types, validators, and utilities here
- No UI code in shared package
- Keep dependencies minimal

### @weldr/auth
- Centralize all authentication logic
- Use secure session management
- Implement proper token refresh logic

## Code Style Rules

### **Comments Policy**
- **ONLY add comments for very complex work** that requires explanation
- **NEVER ADD** explanatory comments for simple operations:
  - ❌ `// Delete this because user requested`
  - ❌ `// Making this true because user asked`
  - ❌ `// Process the request here`
  - ❌ `// Handle user input`
  - ❌ `// Implementation details`
- Write self-documenting code with clear naming instead

### **Emoji Policy**
- **NEVER** use emojis in code, comments, commit messages, or any file content
- **AVOID** emojis in function names, variable names, file names, or documentation
- **KEEP** code professional and text-based only
- **REMOVE** any existing emojis when editing files

## File Naming Conventions
- Use kebab-case for file names: `user-profile.tsx`
- Use PascalCase for component files that export components
- Use camelCase for utility files
- Test files: `*.test.ts` or `*.spec.ts`
- Type definition files: `*.d.ts` or `types.ts`

## Git Workflow
- Use conventional commits (enforced by commitizen)
- Format: `type(scope): description`
- Types: feat, fix, docs, style, refactor, test, chore
- Run `bun commit` for guided commit creation

## Common Commands
```bash
# Development
bun dev          # Start all dev servers
bun build        # Build all packages
bun typecheck    # Run TypeScript type checking
bun check:fix    # Fix linting issues

# Database
bun db:push      # Push schema changes
bun db:generate  # Generate migrations
bun db:migrate   # Run migrations
bun db:studio    # Open Drizzle Studio

# Code Quality
bun lint:staged  # Run linter on staged files
bun commit       # Create conventional commit
```

## Anti-Patterns to Avoid
- ❌ Using `any` type
- ❌ Using non-null assertions (`!`) - handle undefined/null explicitly
- ❌ Ignoring TypeScript errors with @ts-ignore
- ❌ Direct DOM manipulation in React components
- ❌ Synchronous operations in async contexts
- ❌ Hardcoded configuration values
- ❌ Using console.log, console.error, or any console methods in backend code (use Logger from @weldr/shared)
- ❌ Uncommitted generated files
- ❌ Mixed import styles (require/import)
- ❌ Non-validated external data
- ❌ SQL injection vulnerabilities
- ❌ **Implementing functionality without first checking if it already exists**
- ❌ **Using functions without reading their parameters and signatures first**
- ❌ **Creating duplicate utilities when existing ones could be reused**
- ❌ **Ignoring existing coding patterns and architectural style**
- ❌ **Assuming function behavior without inspecting the implementation**

## Performance Guidelines
- Use React.memo for expensive components
- Implement proper loading states
- Use pagination for large data sets
- Optimize bundle size with dynamic imports
- Cache expensive computations
- Use database indexes appropriately

## AI Agent Development
- Tools must have clear, single responsibilities
- Validate all tool inputs with Zod schemas
- Stream responses for better UX
- Handle tool errors gracefully
- Maintain tool registry with proper types
- Use XML parsing for structured LLM responses

## Deployment & Infrastructure
- Use Fly.io for deployment
- Implement health check endpoints
- Use proper environment variable management
- Set up monitoring and logging
- Implement graceful shutdown handlers

## When Adding New Features
1. **SEARCH** the codebase thoroughly for existing similar functionality
2. **READ** and understand existing patterns, function signatures, and implementations
3. **REUSE** existing utilities, functions, and components where applicable
4. Define types and schemas first (following existing patterns)
5. Implement database schema if needed (using existing migration patterns)
6. Create API endpoints with proper validation (mimicking existing router structure)
7. Build UI components with full type safety (following existing component patterns)
8. Add proper error handling (using existing error handling utilities)
9. Write documentation (following existing documentation style)
10. Test edge cases (using existing testing patterns)
11. Ensure backward compatibility

## Code Review Checklist
- [ ] Searched codebase for existing similar functionality before implementing
- [ ] Reused existing utilities, functions, and components where possible
- [ ] Function signatures and parameters read and understood correctly
- [ ] Implementation follows existing coding patterns and architectural style
- [ ] All TypeScript errors resolved
- [ ] Proper error handling implemented
- [ ] Input validation with Zod
- [ ] No hardcoded values
- [ ] Consistent code style
- [ ] No security vulnerabilities
- [ ] Database transactions used appropriately
- [ ] Performance considerations addressed
- [ ] Documentation updated
