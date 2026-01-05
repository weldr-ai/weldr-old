export const codingGuidelines = `<tech_stack>
  - TypeScript (Programming language)
  - React (UI library)
  - Tanstack Router (Routing library)
  - Tanstack Start (Used for SSR only)
  - oRPC (All server routes and APIs - OpenAPI REST APIs that can be called as RPCs on the client)
  - shadcn/ui (UI library)
  - Lucide Icons (Icon library)
  - Tailwind CSS (CSS framework)
  - TanStack Query (Data fetching library)
  - Drizzle ORM (Database ORM)
  - PostgreSQL (Database)
  - better-auth (Authentication library)
  - zod (Validation library)
  - react-hook-form (Form library)
</tech_stack>

<monorepo_architecture>
  This is a monorepo using Turborepo. The agent MUST NEVER create new packages at any time.

  There are three types of projects:

  1. **Backend-only project**:
     - Contains only \`apps/server\` directory
     - Runs on Node.js runtime using \`apps/server/src/server.ts\` file
     - No web application

  2. **Client-only project**:
     - Contains only \`apps/web\` directory
     - Uses TanStack Start ONLY for SSR (Server-Side Rendering)
     - No separate backend server

  3. **Full-stack project**:
     - Contains both \`apps/server\` and \`apps/web\` directories
     - The server runs FROM the TanStack Start app (not standalone)
     - TanStack Start consumes the server via a fetch function at \`apps/server/src/index.ts\`
     - The server does NOT run independently - it's integrated into the web app
</monorepo_architecture>

<projects_structure_guidelines>
  The project MUST follow this file structure:

  Project root directory:
  ├── apps                                      # Folder containing the apps
  │   ├── server                                # Folder containing the server-side code
  │   │   ├── src                               # Server-side source code
  │   │   │   ├── db                            # Folder containing the database (Drizzle ORM)
  │   │   │   │   ├── schema                    # Folder containing the database schema
  │   │   │   │   │   ├── [table-name].ts       # Database table file
  │   │   │   │   │   └── index.ts              # Database schema index file (Re-exports all the files in the schema folder)
  │   │   │   │   └── index.ts                  # Database index file
  │   │   │   ├── lib                           # Folder containing the utility functions
  │   │   │   │   ├── validators                # Folder containing the validators
  │   │   │   │   │   ├── [validator-name].ts   # Validator file
  │   │   │   │   │   └── index.ts              # Validator index file (Re-exports all the files in the validators folder)
  │   │   │   │   ├── utils.ts                  # Utility functions
  │   │   │   │   ├── context.ts                # oRPC context type
  │   │   │   │   ├── auth.ts                   # Initialize authentication
  │   │   │   │   └── ...                       # Other utility functions
  │   │   │   ├── middlewares                   # Folder containing the middlewares
  │   │   │   │   ├── auth.ts                   # Authentication middleware
  │   │   │   │   ├── logger.ts                 # Logger middleware
  │   │   │   │   └── retry.ts                  # Retries failed oRPC calls
  │   │   │   │   └── ...                       # Other middlewares
  │   │   │   ├── routes                        # Folder containing ALL oRPC routes
  │   │   │   │   ├── [group-name]              # Folder containing the oRPC routes by feature/domain
  │   │   │   │   │   ├── [route-name].ts       # Individual oRPC route file
  │   │   │   │   │   └── index.ts              # Defines the oRPC group/router
  │   │   │   │   └── index.ts                  # Export the list of all oRPC groups
  │   │   │   ├── index.ts                      # oRPC server-side entry file (fetch function for full-stack projects)
  │   │   │   ├── router.ts                     # oRPC server-side router file
  │   │   │   └── server.ts                     # Standalone server runner (ONLY for backend-only projects)
  │   │   ├── drizzle.config.ts
  │   │   ├── package.json
  │   │   ├── tsconfig.json
  │   │   └── tsdown.config.ts
  │   └── web                                  # Tanstack Start app
  │       ├── src                              # Folder containing the client-side code
  │       │   ├── components                   # Folder containing the shared components
  │       │   │   ├── ui                       # Folder containing the UI components (includes all shadcn/ui components)
  │       │   │   │   ├── button.tsx           # Button component
  │       │   │   │   └── ...                  # Other UI components
  │       │   │   ├── error-boundary.tsx       # Error boundary component
  │       │   │   ├── mode-toggle.tsx          # Theme toggle dropdown component
  │       │   │   └── not-found.tsx            # Not found component
  │       │   ├── hooks                        # Folder containing the shared hooks
  │       │   │   ├── use-mobile.ts            # shadcn/ui useMobile hook
  │       │   │   └── ...                      # Other shared hooks
  │       │   ├── lib                          # Folder containing the utility functions
  │       │   │   ├── auth                     # Authentication client
  │       │   │   │   ├── get-session-fn.ts    # Get session function
  │       │   │   │   └── index.ts             # Authentication client index file
  │       │   │   ├── orpc.ts                  # oRPC client
  │       │   │   ├── seo.ts                   # SEO utilities
  │       │   │   └── utils.ts                 # Utility functions
  │       │   ├── routes                       # Folder containing the routes
  │       │   │   ├── __root.ts                # Tanstack Start Root route file (READ ONLY)
  │       │   │   ├── [route-name].ts          # Route file
  │       │   │   ├── api.$.ts                 # API entry file (READ ONLY)
  │       │   │   ├── rpc.$.ts                 # RPC entry file (READ ONLY)
  │       │   │   └── ...                      # Other route files/folders
  │       │   ├── styles                       # Styles folder
  │       │   │   └── app.css                  # App styles contains shadcn/ui global styles
  │       │   ├── logo.svg                     # Logo SVG file
  │       │   └── router.tsx                   # Tanstack Start Main router file (READ ONLY)
  │       ├── biome.json
  │       ├── components.json
  │       ├── package.json
  │       ├── tsconfig.json
  │       └── vite.config.ts
  ├── .gitignore
  ├── .npmrc
  ├── biome.json
  ├── bun.lockb
  ├── package.json
  └── turbo.json
</projects_structure_guidelines>

<coding_style_guidelines>
  - MUST NOT use OOP concepts like classes, inheritance, etc.
  - MUST use functions and modules to implement the code.
  - MUST use named exports for utilities and sub-components
  - MUST use default exports for pages and layouts only
  - MUST use path aliases for imports with @repo/web/* prefix for client files and @repo/server/* prefix for server files
  - Path alias configuration:
    - @repo/web/* maps to ./src/* for web/frontend projects
    - @repo/server/* maps to ../server/src/* when both frontend and backend exist
    - @repo/server/* maps to ./src/* for backend-only projects
  - SHOULD avoid imperative programming as much as possible.
  - SHOULD use declarative programming instead.
  - SHOULD use functional programming concepts like immutability, higher-order functions, etc.
  - Prefer using for .. of loops over forEach.
  - Prefer using map, filter, reduce, etc. over for .. in loops.
  - Prefer using async/await over promises.
  - Prefer using try/catch over .then().catch().

  <server_architecture_guidelines>
    - ALL server-related code MUST be written in the \`apps/server\` directory
    - ALL server functionality MUST be implemented as oRPC procedures defined in \`apps/server/src/routes\`
    - Database operations MUST be encapsulated within oRPC procedures
    - Business logic MUST reside in oRPC handlers
    - ALL routes including streaming endpoints, file uploads, data processing, and API integrations MUST be oRPC procedures
    - Client-side code MUST communicate with the server exclusively through oRPC calls using Tanstack Query

    **Server Deployment Patterns**:
    - **Backend-only**: Server runs independently using \`apps/server/src/server.ts\` on Node.js runtime
    - **Full-stack**: Server is consumed by TanStack Start app via fetch function at \`apps/server/src/index.ts\`
    - **Client-only**: No server code, TanStack Start handles SSR only
  </server_architecture_guidelines>

  <example_code_style>
    \`\`\`
    // CORRECT: Type imports (web project)
    import type { User } from '@repo/web/types'
    import { type Config } from '@repo/web/config'

    // CORRECT: Cross-project imports (web importing from server)
    import { auth } from '@repo/server/lib/auth'
    import type { router } from '@repo/server/router'

    // INCORRECT: Runtime type imports
    import { User } from '@repo/web/types'  // Wrong if User is only a type

    // CORRECT: Component imports (web project)
    import { Button } from '@repo/web/components/ui/button'
    import { ChevronRight } from 'lucide-react'

    // CORRECT: Utility imports (web project)
    import { cn } from '@repo/web/lib/utils'

    // CORRECT: Server-side imports (server project)
    import { db } from '@repo/server/db'
    import { publicProcedure } from '@repo/server/lib/utils'
    \`\`\`
  </example_code_style>
</coding_style_guidelines>

<tanstack_router_guidelines>
  - MUST create all route files in the \`/web/routes\` directory
  - MUST use \`createFileRoute\` to create routes
  - MUST use absolute paths for route definitions
  - MUST use kebab-case for route file names
  - MUST use camelCase for route parameter names
  - MUST use camelCase for search parameter names

  <route_naming_conventions>
    Rules:
    - __root.tsx: Root route file must be named __root.tsx and placed in routes root
    - . Separator: Use . to denote nested routes (e.g. blog.post -> /blog/post)
    - $ Token: Use $ for parameterized routes (e.g. $userId -> :userId)
    - _ Prefix: Use _ prefix for pathless layout routes
    - _ Suffix: Use _ suffix to exclude route from parent nesting
    - - Prefix: Use - prefix to exclude files/folders from route tree
    - (folder): Use parentheses for route groups (excluded from URL path)
    - index Token: Use index for matching parent route exactly
    - .route.tsx: Alternative way to define routes using route suffix

    Examples:
    - \`/web/routes/__root.tsx\` -> Root route file
    - \`/web/routes/users/index.tsx\` -> \`/users\`
    - \`/web/routes/users/$userId.tsx\` -> \`/users/:userId\`
    - \`/web/routes/users/$userId/posts/$postId.tsx\` -> \`/users/:userId/posts/:postId\`
    - \`/web/routes/users/$userId/posts/$postId/comments.tsx\` -> \`/users/:userId/posts/:postId/comments\`

    Pathless Layout Examples:
    - \`/web/routes/_app/route.tsx\` -> Pathless layout for all routes
    - \`/web/routes/_app/dashboard.tsx\` -> \`/dashboard\` (inherits app layout)
    - \`/web/routes/_app/settings.tsx\` -> \`/settings\` (inherits app layout)
    - \`/web/routes/_auth/route.tsx\` -> Pathless layout for auth routes
    - \`/web/routes/_auth/login.tsx\` -> \`/login\` (inherits auth layout)
    - \`/web/routes/_auth/register.tsx\` -> \`/register\` (inherits auth layout)
  </route_naming_conventions>

  <params_validation>
    - MUST use zod for params validation
    - MUST transform params to the correct type if needed
    - MUST use descriptive error messages

    Example:
    \`\`\`typescript
    export const Route = createFileRoute("/users/$userId")({
      params: z.object({
        userId: z.string()
          .min(1, "User ID is required")
          .transform(Number)
          .refine((n) => !isNaN(n), "User ID must be a number"),
      }),
    });
    \`\`\`
  </params_validation>

  <search_validation>
    - MUST use zod for search params validation
    - MUST provide default values when appropriate
    - MUST use camelCase for search param names

    Example:
    \`\`\`typescript
    export const Route = createFileRoute("/users")({
      search: z.object({
        page: z.number().default(1),
        perPage: z.number().default(10),
        sortBy: z.enum(["name", "email", "createdAt"]).default("createdAt"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
        search: z.string().optional(),
      }),
    });
    \`\`\`
  </search_validation>

  <using_loaders>
    - MUST use loaders to prefetch data
    - MUST use the context object to access services
    - MUST handle errors appropriately
    - SHOULD use TanStack Query for data fetching

    Example:
    \`\`\`typescript
    export const Route = createFileRoute("/users/$userId")({
      params: z.object({
        userId: z.string().transform(Number),
      }),
      loader: async ({ context, params }) => {
        // Prefetch user data
        await context.queryClient.prefetchQuery(
          context.orpc.users.getById.queryOptions(params.userId)
        );

        // Prefetch user posts
        await context.queryClient.prefetchQuery(
          context.orpc.posts.getByUserId.queryOptions(params.userId)
        );
      },
      component: UserPage,
    });
    \`\`\`
  </using_loaders>

  <error_handling>
    - MUST handle errors in loaders
    - MUST provide meaningful error messages
    - SHOULD use error boundaries for component errors

    Example:
    \`\`\`typescript
    export const Route = createFileRoute("/users/$userId")({
      loader: async ({ context, params }) => {
        try {
          await context.queryClient.prefetchQuery(
            context.orpc.users.getById.queryOptions(params.userId)
          );
        } catch (error) {
          throw new Error("Failed to load user data");
        }
      },
      component: UserPage,
      errorComponent: ({ error }) => (
        <div className="text-destructive">
          <h1>Error</h1>
          <p>{error.message}</p>
        </div>
      ),
    });
    \`\`\`
  </error_handling>

  <auth_guidelines>
    - The session data is stored in the Tanstack Router context.
    - You can access the session data from the context object in the loader function.
    - Any protected route can just be added under the /_authed route group.

    Get the current session on the client:
    <example_getting_session_in_routes>
      /web/routes/_authed/some-route.tsx
      \`\`\`
      import { createFileRoute } from "@tanstack/react-router";

      export const Route = createFileRoute("/some-route")({
        loader: async ({ context }) => {
          return { session: context.session, user: context.user };
        },
        component: RouteComponent,
      });

      function RouteComponent() {
        const { user } = Route.useLoaderData();
        return <div>{user.email}</div>;
      }
      \`\`\`
  </example_getting_session_in_routes>

  <example_getting_session_in_components>
    /web/components/user-button.tsx
    \`\`\`
    import { useLoaderData } from "@tanstack/react-router";

    function UserButton() {
	    const { session } = useLoaderData({ from: "__root__" });
      return (
        <>
          {session ? (
            <div>Private Data</div>
          ) : (
            <div>Public Data</div>
          )}
        </>
      );
    }
    \`\`\`
    </example_getting_session_in_components>
  </auth_guidelines>
</tanstack_router_guidelines>

<oRPC_guidelines>
  - oRPC is already configured in the project.
  - MUST create all oRPC related files in the \`/server/orpc\` directory.
  - MUST use the \`publicProcedure\` and \`protectedProcedure\` to create your procedures.
  - MUST define OpenAPI specifications for all oRPC routes using the \`.route()\` method.
  - MUST implement optimistic updates for mutations to provide instant user feedback.

  <openapi_requirements>
    All oRPC routes MUST include OpenAPI specifications:
    - Import \`Route\` type from "@orpc/server"
    - Define a \`route\` const object with \`satisfies Route\`
    - Include: method, tags, path, successStatus, description, summary
    - Use appropriate HTTP methods (GET for queries, POST for mutations)
    - Use appropriate status codes (200 for queries, 201 for creation)
    - Group related routes with consistent tags
    - Provide clear descriptions and summaries
    - Use \`.route(route)\` before \`.input()\` and \`.output()\`
    - Define the procedure as a const and export as default
    - Define separate files for each route operation
  </openapi_requirements>

  <route_registration>
    All oRPC routes MUST be registered in the router using a hierarchical structure:
    - Each route file should use default export
    - Each resource group MUST have an index file that creates a router for that group
    - MUST manually register new resource groups in the main router file
    - Routes are organized by resource with nested structure

    Example structure:
    apps/server/src/routes/todos/index.ts
    \`\`\`typescript
    import { base } from "@repo/server/lib/utils";
    import create from "./create";
    import deleteRoute from "./delete";
    import find from "./find";
    import list from "./list";
    import update from "./update";

    export default base.router({
      create,
      find,
      list,
      update,
      delete: deleteRoute,
    });
    \`\`\`

    apps/server/src/router.ts
    \`\`\`typescript
    import chat from "@repo/server/routes/chat";
    import health from "@repo/server/routes/health";
    import todos from "@repo/server/routes/todos";

    export const router = {
      health,
      todos,
      chat,
    };
    \`\`\`

    Note: Use alias for reserved keywords (e.g., \`delete: deleteRoute\`)
  </route_registration>

  <optimistic_updates_guidelines>
    When implementing mutations, ALWAYS prefer optimistic updates:
    - Use \`onMutate\` to immediately update the UI before the server responds
    - Use temporary IDs (negative numbers) for new items being created
    - Use \`onError\` to roll back changes if the mutation fails
    - Use \`onSuccess\` to replace temporary data with server response
    - Use \`onSettled\` to ensure data consistency by invalidating queries
    - Cancel ongoing queries with \`queryClient.cancelQueries\` to prevent race conditions
    - Snapshot previous state for rollback on errors
    - Show visual feedback for optimistic items (e.g., opacity, disabled state)
  </optimistic_updates_guidelines>

  <oRPC_endpoint_patterns>
    - MUST import ORPCError for error handling from "@orpc/server"
    - MUST use proper middlewares: useDb for database access, retry for retries
    - MUST access database through context.db (from useDb middleware) NOT direct db import
    - MUST use Drizzle query builder with context.db.query for complex queries
    - MUST use proper Zod validators from @repo/server/lib/validators
    - MUST include proper OpenAPI specification with method, tags, path, successStatus
    - MUST use protectedProcedure for authenticated routes, publicProcedure for public routes
    - MUST omit auto-generated fields (id, userId, createdAt, updatedAt) from input schemas
    - MUST use proper error handling with ORPCError for not found, validation errors, etc
    - MUST name the route definition const as \`definition\`
    - MUST name the route const as \`route\` and export as default
    </oRPC_endpoint_patterns>

  <example_oRPC_router>
    apps/server/src/routes/blogs/list.ts
    \`\`\`
    import { type Route } from "@orpc/server";
    import { z } from "zod";

    import { blogs } from "@repo/server/db/schema";
    import { publicProcedure } from "@repo/server/lib/utils";
    import { selectBlogSchema } from "@repo/server/lib/validators/blogs";
    import { useDb } from "@repo/server/middlewares/db";
    import { retry } from "@repo/server/middlewares/retry";

    const definition = {
      method: "GET",
      tags: ["Blogs"],
      path: "/blogs",
      successStatus: 200,
      description: "Get list of blogs",
      summary: "Get blogs",
    } satisfies Route;

    const route = publicProcedure
      .route(definition)
      .use(useDb)
      .use(retry({ times: 3 }))
      .output(z.array(selectBlogSchema))
      .handler(async ({ context }) => {
        return await context.db.query.blogs.findMany({
          orderBy: (blogs, { desc }) => [desc(blogs.createdAt)],
        });
      });

    export default route;
    \`\`\`

    apps/server/src/routes/blogs/create.ts
    \`\`\`
    import { type Route } from "@orpc/server";
    import { z } from "zod";

    import { blogs } from "@repo/server/db/schema";
    import { protectedProcedure } from "@repo/server/lib/utils";
    import { insertBlogSchema, selectBlogSchema } from "@repo/server/lib/validators/blogs";
    import { useDb } from "@repo/server/middlewares/db";
    import { retry } from "@repo/server/middlewares/retry";

    const definition = {
      method: "POST",
      tags: ["Blogs"],
      path: "/blogs",
      successStatus: 201,
      description: "Create a new blog post",
      summary: "Create blog",
    } satisfies Route;

    const route = protectedProcedure
      .route(definition)
      .use(useDb)
      .use(retry({ times: 3 }))
      .input(insertBlogSchema.omit({ id: true, userId: true, createdAt: true, updatedAt: true }))
      .output(selectBlogSchema)
      .handler(async ({ context, input }) => {
        const [blog] = await context.db
          .insert(blogs)
          .values({
            ...input,
            userId: context.user.id,
          })
          .returning();

        return blog;
      });

    export default route;
    \`\`\`
  </example_oRPC_router>

  <example_calling_oRPC_procedures_on_client>
    - You use the \`orpc\` client directly to call procedures with TanStack Query.
    - MUST implement optimistic updates for better user experience whenever possible.
    - SHOULD use \`onMutate\`, \`onError\`, and \`onSettled\` callbacks for proper state management.

    apps/web/src/routes/todos/index.tsx
    \`\`\`
    import { Button } from "@repo/web/components/ui/button";
    import { Card, CardContent, CardHeader, CardTitle } from "@repo/web/components/ui/card";
    import { Checkbox } from "@repo/web/components/ui/checkbox";
    import { Input } from "@repo/web/components/ui/input";
    import { orpc } from "@repo/web/lib/orpc";
    import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
    import { createFileRoute } from "@tanstack/react-router";
    import { Loader2 } from "lucide-react";
    import { useState } from "react";
    import { toast } from "sonner";

    export const Route = createFileRoute("/todos/")({
      loader: async ({ context }) => {
        await context.queryClient.prefetchQuery(
          context.orpc.todos.list.queryOptions()
        );
      },
      component: TodosList,
    });

    function TodosList() {
      const [newTodoText, setNewTodoText] = useState("");
      const queryClient = useQueryClient();

      const todos = useQuery(orpc.todos.list.queryOptions());

      // Optimistic create mutation
      const createMutation = useMutation(
        orpc.todos.create.mutationOptions({
          onMutate: async (newTodo) => {
            // Cancel outgoing refetches
            await queryClient.cancelQueries(orpc.todos.list.queryOptions());

            // Snapshot previous value
            const previousTodos = queryClient.getQueryData(
              orpc.todos.list.key({ type: "query" }),
            );

            // Create temporary todo with negative ID
            const tempTodo = {
              id: -Date.now(),
              text: newTodo.text,
              completed: false,
              createdAt: new Date(),
            };

            // Optimistically update
            queryClient.setQueryData(
              orpc.todos.list.key({ type: "query" }),
              (old: typeof todos.data) => {
                if (!old) return [tempTodo];
                return [tempTodo, ...old];
              },
            );

            return { previousTodos, tempTodoId: tempTodo.id };
          },
          onError: (_error, _variables, context) => {
            // Roll back on error
            if (context?.previousTodos) {
              queryClient.setQueryData(
                orpc.todos.list.key({ type: "query" }),
                context.previousTodos,
              );
            }
            toast.error("Failed to create todo");
          },
          onSuccess: (data, _variables, context) => {
            // Replace temp todo with real one
            queryClient.setQueryData(
              orpc.todos.list.key({ type: "query" }),
              (old: typeof todos.data) => {
                if (!old) return [data];
                return old.map((todo) =>
                  todo.id === context?.tempTodoId ? data : todo,
                );
              },
            );
            setNewTodoText("");
          },
          onSettled: () => {
            // Ensure consistency
            queryClient.invalidateQueries(orpc.todos.list.queryOptions());
          },
        })
      );

      // Optimistic toggle mutation
      const toggleMutation = useMutation(
        orpc.todos.update.mutationOptions({
          onMutate: async (updatedTodo) => {
            await queryClient.cancelQueries(orpc.todos.list.queryOptions());

            const previousTodos = queryClient.getQueryData(
              orpc.todos.list.key({ type: "query" }),
            );

            // Optimistically update
            queryClient.setQueryData(
              orpc.todos.list.key({ type: "query" }),
              (old: typeof todos.data) => {
                if (!old) return old;
                return old.map((todo) =>
                  todo.id === updatedTodo.id
                    ? { ...todo, completed: updatedTodo.completed }
                    : todo,
                );
              },
            );

            return { previousTodos };
          },
          onError: (_error, _variables, context) => {
            if (context?.previousTodos) {
              queryClient.setQueryData(
                orpc.todos.list.key({ type: "query" }),
                context.previousTodos,
              );
            }
            toast.error("Failed to update todo");
          },
          onSettled: () => {
            queryClient.invalidateQueries(orpc.todos.list.queryOptions());
          },
        })
      );

      const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (newTodoText.trim()) {
          createMutation.mutate({ text: newTodoText });
        }
      };

      const handleToggle = (id: number, completed: boolean) => {
        toggleMutation.mutate({ id, completed: !completed });
      };

      return (
        <Card>
          <CardHeader>
            <CardTitle>Todo List</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="mb-4 flex gap-2">
              <Input
                value={newTodoText}
                onChange={(e) => setNewTodoText(e.target.value)}
                placeholder="Add a new task..."
                disabled={createMutation.isPending}
              />
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Add"
                )}
              </Button>
            </form>

            {todos.isLoading ? (
              <div className="flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <ul className="space-y-2">
                {todos.data?.map((todo) => {
                  const isOptimistic = todo.id < 0;
                  return (
                    <li key={todo.id} className={\`flex items-center gap-2 \${isOptimistic ? 'opacity-50' : ''}\`}>
                      <Checkbox
                        checked={todo.completed}
                        onCheckedChange={() => handleToggle(todo.id, todo.completed)}
                        disabled={isOptimistic}
                      />
                      <span>{todo.text}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      );
    }
    \`\`\`

    - Parametrized example:
    /web/routes/todos/$id.tsx
    \`\`\`
    import { orpc } from "@repo/web/lib/orpc";
    import { useQuery } from "@tanstack/react-query";
    import { createFileRoute } from "@tanstack/react-router";
    import { z } from "zod";

    export const Route = createFileRoute("/todos/$id")({
      params: z.object({
        id: z.string().transform(Number),
      }),
      loader: async ({ context, params }) => {
        await context.queryClient.prefetchQuery(
          context.orpc.todos.getById.queryOptions({ id: params.id })
        );
      },
      component: TodoPage,
    });

    function TodoPage() {
      const { id } = Route.useParams();
      const { data, error } = useQuery(orpc.todos.getById.queryOptions({ id }));

      if (error) {
        return <div>Error: {error.message}</div>;
      }

      return <div>{data?.text}</div>;
    }
    \`\`\`
  </example_calling_oRPC_procedures_on_client>
</oRPC_guidelines>

<forms_guidelines>
  - MUST use shadcn/ui form components for all forms
  - MUST use zod for schema validation with proper error messages
  - MUST use react-hook-form with zodResolver for form handling
  - MUST define form schemas separately with descriptive names
  - MUST use TypeScript type inference from zod schemas
  - SHOULD implement optimistic updates for form submissions

  <example_building_forms>
    apps/web/src/components/create-bookmark-form.tsx
    \`\`\`
            import { Button } from "@repo/web/components/ui/button";
    import {
      Form,
      FormControl,
      FormField,
      FormItem,
      FormLabel,
      FormMessage,
    } from "@repo/web/components/ui/form";
    import { Input } from "@repo/web/components/ui/input";
    import { orpc } from "@repo/web/lib/orpc";
    import { zodResolver } from "@hookform/resolvers/zod";
    import { useMutation, useQueryClient } from "@tanstack/react-query";
    import { Loader2 } from "lucide-react";
    import { useForm } from "react-hook-form";
    import { toast } from "sonner";
    import { z } from "zod";

    // Form validation schema
    const createBookmarkSchema = z.object({
      url: z.string().url("Please enter a valid URL").min(1, "URL is required"),
      title: z.string().min(1, "Title is required").trim(),
      description: z.string().optional(),
    });

    type CreateBookmarkFormValues = z.infer<typeof createBookmarkSchema>;

    export function CreateBookmarkForm() {
      const queryClient = useQueryClient();

      const form = useForm<CreateBookmarkFormValues>({
        resolver: zodResolver(createBookmarkSchema),
        defaultValues: {
          url: "",
          title: "",
          description: "",
        },
      });

      const createMutation = useMutation(
        orpc.bookmarks.create.mutationOptions({
          onMutate: async (newBookmark) => {
            await queryClient.cancelQueries(orpc.bookmarks.list.queryOptions());

            const previousBookmarks = queryClient.getQueryData(
              orpc.bookmarks.list.key({ type: "query" }),
            );

            const tempBookmark = {
              id: -Date.now(),
              ...newBookmark,
              createdAt: new Date(),
            };

            queryClient.setQueryData(
              orpc.bookmarks.list.key({ type: "query" }),
              (old: any) => {
                if (!old) return [tempBookmark];
                return [tempBookmark, ...old];
              },
            );

            return { previousBookmarks };
          },
          onError: (_error, _variables, context) => {
            if (context?.previousBookmarks) {
              queryClient.setQueryData(
                orpc.bookmarks.list.key({ type: "query" }),
                context.previousBookmarks,
              );
            }
            toast.error("Failed to create bookmark");
          },
          onSuccess: () => {
            form.reset();
            toast.success("Bookmark created!");
          },
          onSettled: () => {
            queryClient.invalidateQueries(orpc.bookmarks.list.queryOptions());
          },
        })
      );

      const onSubmit = (values: CreateBookmarkFormValues) => {
        createMutation.mutate(values);
      };

      return (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="https://example.com"
                      disabled={createMutation.isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Bookmark title"
                      disabled={createMutation.isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Brief description"
                      disabled={createMutation.isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              disabled={
                !form.formState.isValid ||
                !form.formState.isDirty ||
                createMutation.isPending
              }
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Create Bookmark"
              )}
            </Button>
          </form>
        </Form>
      );
    }
    \`\`\`
  </example_building_forms>
</forms_guidelines>

<database_guidelines>
  - You MUST NOT configure Drizzle ORM, it can only be configured by calling the \`configure-database\` tool.
  - You can define the tables in the \`src/db/schema\` folder.
  - You can use the database instance in the \`src/server/db/index.ts\` file.

  <defining_tables>
    - Weldr MUST write each table in a separate file and export it in the index file.
    - Weldr MUST write the relations in the same file of the table.

    /server/db/schema/blogs.ts
    \`\`\`
    import { relations } from "drizzle-orm";
    import { pgTable, serial, text } from "drizzle-orm/pg-core";
    import { users } from "./users";

    export const blogs = pgTable("blogs", {
      id: serial("id").primaryKey(),
      title: text("title"),
      content: text("content"),
      userId: text("user_id").references(() => users.id),
    });

    export const blogsRelations = relations(blogs, ({ one }) => ({
      user: one(users, {
        fields: [blogs.userId],
        references: [users.id],
      }),
    }));
    \`\`\`

    After defining the table, you MUST export it in the index file.

    /server/db/schema/index.ts
    \`\`\`
    export * from "./blogs";
    export * from "./users";
    \`\`\`
  </defining_tables>
</database_guidelines>

<styling_guidelines>
  - MUST use shadcn/ui components from @/components/ui
  - MUST use Lucide React for icons
  - MUST use shadcn/ui css color variables
  - Tailwind CSS for styling

  <example_shadcn_ui_color_variables>
    \`\`\`
    export default function Component() {
      return (
        // CORRECT: Use semantic color variables
        <div className="bg-background text-foreground">
        {/* Primary colors */}
        <div className="bg-primary text-primary-foreground">Primary</div>

        {/* Secondary colors */}
        <div className="bg-secondary text-secondary-foreground">Secondary</div>

        {/* Accent colors */}
        <div className="bg-accent text-accent-foreground">Accent</div>

        {/* Muted colors */}
        <div className="bg-muted text-muted-foreground">Muted</div>

        {/* Card colors */}
        <div className="bg-card text-card-foreground">Card</div>

        {/* Destructive colors */}
        <div className="bg-destructive text-destructive-foreground">Destructive</div>
      )
    }
    \`\`\`
  </example_shadcn_ui_color_variables>
</styling_guidelines>

<use_native_apis>
  PREFER Native APIs:
  \`\`\`
  // CORRECT: Using native fetch
  async function getData() {
    const res = await fetch('/api/data')
    return res.json()
  }
  \`\`\`

  AVOID Unless Necessary:
  - HTTP client libraries when fetch is sufficient
</use_native_apis>

<state_management_guidelines>
  PREFER:
  - React's built-in useState/useReducer
  - Server Components for server state
  - TanStack Query for data caching
  - React Context for global UI state
  CONSIDER When Needed:
  - Zustand for complex client state
  - Jotai for atomic state
</state_management_guidelines>

<accessibility_guidelines>
  - Weldr implements accessibility best practices.
  - Use semantic HTML elements when appropriate, like main and header.
  - Make sure to use the correct ARIA roles and attributes.
  - Remember to use the "sr-only" Tailwind class for screen reader only text.
  - Add alt text for all images, unless they are purely decorative or unless it would be repetitive for screen readers.
</accessibility_guidelines>

<final_reminders>
  Remember these critical guidelines when building the application:

  1. **Monorepo Architecture**:
     - This is a Turborepo monorepo - NEVER create new packages
     - Backend-only: Only apps/server, runs via server.ts on Node.js
     - Client-only: Only apps/web, TanStack Start for SSR only
     - Full-stack: Both apps, server consumed by TanStack Start via index.ts fetch function

  2. **Server Architecture**:
     - ALL server code goes in apps/server directory
     - Use oRPC procedures for ALL server functionality including streaming endpoints
     - Client communicates with server ONLY through oRPC + TanStack Query

  3. **oRPC Requirements**:
     - Define OpenAPI specs for ALL routes with .route() method
     - Use publicProcedure or protectedProcedure appropriately
     - Create group index files with base.router()
     - Register routes in main router.ts manually

  4. **Optimistic Updates**:
     - ALWAYS implement optimistic updates for mutations
     - Use onMutate, onError, onSuccess, onSettled callbacks
     - Use negative IDs for temporary items
     - Show visual feedback for optimistic states

  5. **Forms & Validation**:
     - Use shadcn/ui Form components exclusively
     - Use react-hook-form with zodResolver
     - Define separate Zod schemas with descriptive names
     - Implement optimistic updates for form submissions

  6. **Database with Drizzle**:
     - One table per file in /server/db/schema
     - Export everything in schema/index.ts
     - Define relations in same file as table
     - Use proper TypeScript inference

  7. **File Structure**:
     - Follow the exact folder structure specified
     - Use @repo/web/* prefix for web imports, @repo/server/* for server imports
     - Default exports only for pages/layouts, named exports otherwise

  8. **Styling**:
     - Use shadcn/ui components and color variables
     - Use Lucide React for icons
     - Follow accessibility guidelines with semantic HTML

  9. **TanStack Router**:
     - Use createFileRoute for all routes
     - Validate params and search with Zod
     - Prefetch data in loaders
     - Use proper error handling

  Common mistakes to avoid:
  - Creating server utilities outside of oRPC procedures
  - Forgetting OpenAPI specifications
  - Not implementing optimistic updates
  - Using incorrect import paths or prefixes (use @repo/web/* and @repo/server/*)
  - Missing form validation or using wrong form libraries
  - Creating files in wrong directories
</final_reminders>`;
