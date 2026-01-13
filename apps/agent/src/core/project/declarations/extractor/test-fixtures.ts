/**
 * Test fixtures for declaration extraction and dependency resolution
 * These represent ACTUAL patterns produced by the coding agent based on coding guidelines
 * - oRPC endpoints with OpenAPI specs
 * - Drizzle ORM database models with relations
 * - TanStack Router pages with loaders
 */

export interface TestFixture {
  name: string;
  description: string;
  filePath: string;
  sourceCode: string;
  expectedDeclarations?: string[];
  expectedDependencies?: {
    internal?: string[];
    external?: string[];
  };
}

export const fixtures: TestFixture[] = [
  {
    name: "orpc-endpoint-list",
    description: "oRPC list endpoint with OpenAPI spec (GET)",
    filePath: "apps/server/src/routes/users/list.ts",
    sourceCode: `
import { type Route } from "@orpc/server";
import { z } from "zod";

import { users } from "@repo/server/db/schema";
import { publicProcedure } from "@repo/server/lib/utils";
import { selectUserSchema } from "@repo/server/lib/validators/users";
import { useDb } from "@repo/server/middlewares/db";
import { retry } from "@repo/server/middlewares/retry";

const definition = {
  method: "GET",
  tags: ["Users"],
  path: "/users",
  successStatus: 200,
  description: "Get list of users",
  summary: "Get users",
} satisfies Route;

const route = publicProcedure
  .route(definition)
  .use(useDb)
  .use(retry({ times: 3 }))
  .output(z.array(selectUserSchema))
  .handler(async ({ context }) => {
    return await context.db.query.users.findMany({
      orderBy: (users, { desc }) => [desc(users.createdAt)],
    });
  });

export default route;
`.trim(),
    expectedDeclarations: ["definition", "route", "default"],
    expectedDependencies: {
      internal: [
        "apps/server/src/db/schema/users.ts",
        "apps/server/src/lib/utils.ts",
        "apps/server/src/lib/validators/users.ts",
        "apps/server/src/middlewares/db.ts",
        "apps/server/src/middlewares/retry.ts",
      ],
      external: ["@orpc/server", "zod"],
    },
  },

  {
    name: "orpc-endpoint-create",
    description: "oRPC create endpoint with OpenAPI spec (POST)",
    filePath: "apps/server/src/routes/users/create.ts",
    sourceCode: `
import { type Route } from "@orpc/server";

import { users } from "@repo/server/db/schema";
import { protectedProcedure } from "@repo/server/lib/utils";
import {
  insertUserSchema,
  selectUserSchema,
} from "@repo/server/lib/validators/users";
import { useDb } from "@repo/server/middlewares/db";
import { retry } from "@repo/server/middlewares/retry";

const definition = {
  method: "POST",
  tags: ["Users"],
  path: "/users",
  successStatus: 201,
  description: "Create a new user",
  summary: "Create user",
} satisfies Route;

const route = protectedProcedure
  .route(definition)
  .use(useDb)
  .use(retry({ times: 3 }))
  .input(
    insertUserSchema.omit({
      id: true,
      createdAt: true,
      updatedAt: true,
    }),
  )
  .output(selectUserSchema)
  .handler(async ({ context, input }) => {
    const [user] = await context.db
      .insert(users)
      .values({
        ...input,
        userId: context.user.id,
      })
      .returning();

    return user;
  });

export default route;
`.trim(),
    expectedDeclarations: ["definition", "route", "default"],
    expectedDependencies: {
      internal: [
        "apps/server/src/db/schema/users.ts",
        "apps/server/src/lib/utils.ts",
        "apps/server/src/lib/validators/users.ts",
        "apps/server/src/middlewares/db.ts",
        "apps/server/src/middlewares/retry.ts",
      ],
      external: ["@orpc/server"],
    },
  },

  {
    name: "orpc-endpoint-find",
    description: "oRPC find by ID endpoint with error handling",
    filePath: "apps/server/src/routes/users/find.ts",
    sourceCode: `
import { ORPCError, type Route } from "@orpc/server";
import { z } from "zod";

import { users } from "@repo/server/db/schema";
import { eq } from "drizzle-orm";
import { publicProcedure } from "@repo/server/lib/utils";
import { selectUserSchema } from "@repo/server/lib/validators/users";
import { useDb } from "@repo/server/middlewares/db";
import { retry } from "@repo/server/middlewares/retry";

const definition = {
  method: "GET",
  tags: ["Users"],
  path: "/users/:id",
  successStatus: 200,
  description: "Get user by ID",
  summary: "Get user",
} satisfies Route;

const route = publicProcedure
  .route(definition)
  .use(useDb)
  .use(retry({ times: 3 }))
  .input(
    z.object({
      id: z.string().uuid("Invalid user ID"),
    }),
  )
  .output(selectUserSchema)
  .handler(async ({ context, input }) => {
    const user = await context.db.query.users.findFirst({
      where: eq(users.id, input.id),
    });

    if (!user) {
      throw new ORPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    return user;
  });

export default route;
`.trim(),
    expectedDeclarations: ["definition", "route", "default"],
    expectedDependencies: {
      internal: [
        "apps/server/src/db/schema/users.ts",
        "apps/server/src/lib/utils.ts",
        "apps/server/src/lib/validators/users.ts",
        "apps/server/src/middlewares/db.ts",
        "apps/server/src/middlewares/retry.ts",
      ],
      external: ["@orpc/server", "zod", "drizzle-orm"],
    },
  },

  {
    name: "db-model-with-relations",
    description: "Drizzle database model with relations",
    filePath: "apps/server/src/db/schema/users.ts",
    sourceCode: `
import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { posts } from "./posts";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
`.trim(),
    expectedDeclarations: ["users", "usersRelations", "User", "NewUser"],
    expectedDependencies: {
      internal: ["apps/server/src/db/schema/posts.ts"],
      external: ["drizzle-orm", "drizzle-orm/pg-core"],
    },
  },

  {
    name: "db-model-with-references",
    description: "Drizzle database model with foreign key references",
    filePath: "apps/server/src/db/schema/posts.ts",
    sourceCode: `
import { relations } from "drizzle-orm";
import { pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const postsRelations = relations(posts, ({ one }) => ({
  user: one(users, {
    fields: [posts.userId],
    references: [users.id],
  }),
}));

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
`.trim(),
    expectedDeclarations: ["posts", "postsRelations", "Post", "NewPost"],
    expectedDependencies: {
      internal: ["apps/server/src/db/schema/users.ts"],
      external: ["drizzle-orm", "drizzle-orm/pg-core"],
    },
  },

  {
    name: "tanstack-router-page-with-loader",
    description: "TanStack Router page with loader and oRPC prefetch",
    filePath: "apps/web/src/routes/users/index.tsx",
    sourceCode: `
import { Button } from "@repo/web/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/web/components/ui/card";
import { orpc } from "@repo/web/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/users/")({
  loader: async ({ context }) => {
    await context.queryClient.prefetchQuery(
      context.orpc.users.list.queryOptions(),
    );
  },
  component: UsersPage,
});

function UsersPage() {
  const users = useQuery(orpc.users.list.queryOptions());

  if (users.isLoading) {
    return (
      <div className="flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {users.data?.map((user) => (
            <li key={user.id}>{user.name}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default UsersPage;
`.trim(),
    expectedDeclarations: ["Route", "UsersPage", "default"],
    expectedDependencies: {
      internal: [
        "apps/web/src/components/ui/button.tsx",
        "apps/web/src/components/ui/card.tsx",
        "apps/web/src/lib/orpc.ts",
      ],
      external: ["@tanstack/react-query", "@tanstack/react-router", "lucide-react"],
    },
  },

  {
    name: "tanstack-router-page-with-params",
    description: "TanStack Router page with params validation and loader",
    filePath: "apps/web/src/routes/users/$userId.tsx",
    sourceCode: `
import { Card, CardContent, CardHeader, CardTitle } from "@repo/web/components/ui/card";
import { orpc } from "@repo/web/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/users/$userId")({
  params: z.object({
    userId: z.string().uuid("Invalid user ID"),
  }),
  loader: async ({ context, params }) => {
    await context.queryClient.prefetchQuery(
      context.orpc.users.find.queryOptions({ id: params.userId }),
    );
  },
  component: UserPage,
});

function UserPage() {
  const { userId } = Route.useParams();
  const user = useQuery(orpc.users.find.queryOptions({ id: userId }));

  if (user.isLoading) {
    return <div>Loading...</div>;
  }

  if (user.error) {
    return <div>Error: {user.error.message}</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{user.data?.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <p>{user.data?.email}</p>
      </CardContent>
    </Card>
  );
}

export default UserPage;
`.trim(),
    expectedDeclarations: ["Route", "UserPage", "default"],
    expectedDependencies: {
      internal: ["apps/web/src/components/ui/card.tsx", "apps/web/src/lib/orpc.ts"],
      external: ["@tanstack/react-query", "@tanstack/react-router", "zod"],
    },
  },

  {
    name: "tanstack-router-page-with-mutations",
    description: "TanStack Router page with optimistic mutations",
    filePath: "apps/web/src/routes/users/create.tsx",
    sourceCode: `
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
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/users/create")({
  component: CreateUserPage,
});

const createUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
});

type CreateUserFormValues = z.infer<typeof createUserSchema>;

function CreateUserPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: "",
      email: "",
    },
  });

  const createMutation = useMutation(
    orpc.users.create.mutationOptions({
      onMutate: async (newUser) => {
        await queryClient.cancelQueries(orpc.users.list.queryOptions());

        const previousUsers = queryClient.getQueryData(
          orpc.users.list.key({ type: "query" }),
        );

        const tempUser = {
          id: \`temp-\${Date.now()}\`,
          ...newUser,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        queryClient.setQueryData(
          orpc.users.list.key({ type: "query" }),
          (old: any) => {
            if (!old) return [tempUser];
            return [tempUser, ...old];
          },
        );

        return { previousUsers };
      },
      onError: (_error, _variables, context) => {
        if (context?.previousUsers) {
          queryClient.setQueryData(
            orpc.users.list.key({ type: "query" }),
            context.previousUsers,
          );
        }
        toast.error("Failed to create user");
      },
      onSuccess: () => {
        form.reset();
        toast.success("User created!");
        navigate({ to: "/users" });
      },
      onSettled: () => {
        queryClient.invalidateQueries(orpc.users.list.queryOptions());
      },
    }),
  );

  const onSubmit = (values: CreateUserFormValues) => {
    createMutation.mutate(values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="John Doe"
                  disabled={createMutation.isPending}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="email"
                  placeholder="john@example.com"
                  disabled={createMutation.isPending}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Create User"
          )}
        </Button>
      </form>
    </Form>
  );
}

export default CreateUserPage;
`.trim(),
    expectedDeclarations: ["Route", "createUserSchema", "CreateUserPage", "default"],
    expectedDependencies: {
      internal: [
        "apps/web/src/components/ui/button.tsx",
        "apps/web/src/components/ui/form.tsx",
        "apps/web/src/components/ui/input.tsx",
        "apps/web/src/lib/orpc.ts",
      ],
      external: [
        "@hookform/resolvers/zod",
        "@tanstack/react-query",
        "@tanstack/react-router",
        "lucide-react",
        "react-hook-form",
        "sonner",
        "zod",
      ],
    },
  },
];
