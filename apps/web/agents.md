# Web Application Development Guidelines

## Platform Overview

**Weldr** is an AI-powered application builder platform that enables users to create full-stack web applications through natural language conversations. Users describe their app ideas in plain English, and the AI generates complete, production-ready applications with proper architecture, database schemas, APIs, and UI components.

### Core User Journey

1. **Project Creation**: Users describe their app idea or choose from templates
2. **AI Generation**: The platform generates the complete application structure
3. **Visual Canvas**: Interactive architecture visualization with nodes for pages, endpoints, and models
4. **Chat Interface**: Continuous iteration through conversational AI
5. **Version Control**: Every change creates a new tracked version
6. **Deployment**: Automatic deployment to development and production environments

### Key Features

- Multimodal input (text + file attachments)
- Real-time streaming of AI progress
- Visual architecture canvas
- Integration management (auth, database, payments, etc.)
- Environment variable configuration
- Version history with navigation
- Subscription-based pricing model

## Current Structure

- `src/app`: app router routes (landing, pricing, projects, auth flows, API handlers), shared layout/loading/not-found
- `src/components`: auth, billing, chat, editor, integrations, projects, openapi viewer, command center, timeline, dialogs
- `src/hooks`: event stream, workflow trigger, messages, chat visibility, editor references, scroll management, status
- `src/lib`: tRPC client/server helpers, context providers (ui-store), action helpers (get-active-subscription), shared utilities
- `src/types`: shared client-side types for UI

## Local Commands

- `bun dev`: `bun with-env next dev --turbopack -p 3000`
- `bun build`: `next build`
- `bun start`: `next start`
- `bun typecheck`: `tsc --noEmit --emitDeclarationOnly false`
- `bun clean`: `git clean -xdf .next .turbo node_modules dist tsconfig.tsbuildinfo`
- `bun with-env`: `dotenv -e ../../.env --`

## Providers & Globals

- Root providers are configured in `src/app/layout.tsx` (ReactFlow, tRPC/query client, theme provider, tooltips).
- Global styles are pulled from `@weldr/ui/styles/globals.css` in the root layout.

## Type Safety Requirements

### Component Props

```typescript
// ALWAYS define explicit prop types
interface ComponentProps {
  id: string;
  title: string;
  optional?: boolean;
  children: React.ReactNode;
}

// Use FC type with generics for type safety
export const MyComponent: React.FC<ComponentProps> = ({
  id,
  title,
  optional = false,
  children,
}) => {
  // Implementation
};
```

### tRPC Usage

```typescript
// ALWAYS use type-safe tRPC hooks
import { api } from "@/lib/trpc/react";

export function MyComponent() {
  // Queries with type inference
  const { data, error, isLoading } = api.projects.list.useQuery();

  // Mutations with type-safe inputs
  const createProject = api.projects.create.useMutation({
    onSuccess: (data) => {
      // data is fully typed
    },
    onError: (error) => {
      // Handle typed errors
    },
  });

  // Call mutation with validated input
  await createProject.mutateAsync({
    title: "Project",
    description: "Description",
  });
}
```

### Form Handling with Zod

```typescript
// ALWAYS validate forms with Zod schemas
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const formSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

type FormData = z.infer<typeof formSchema>;

export function MyForm() {
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = (data: FormData) => {
    // data is validated and typed
  };
}
```

## Core Application Components

### Project Creation Form

- Main entry point for users
- Multimodal input with text and file attachments
- Quick-start templates for common app types
- Loading state during project initialization

### Project View

- Split view with canvas and chat interface
- Real-time updates via SSE streaming
- Version navigation (previous/next)
- Integration setup flows

### Chat Interface

- Message history display
- Multimodal input for continued conversation
- Pending message states (thinking, responding, waiting)
- Tool result displays
- Attachment previews

### Canvas View

- Visual representation of app architecture
- Interactive nodes for:
  - Pages (UI components)
  - Endpoints (API routes)
  - Database models
  - Integrations
- Dependency edges between nodes
- Progress indicators for generation status

## Next.js App Router Patterns

### Server Components

```typescript
// Default to server components
// app/page.tsx
export default async function Page() {
  // Direct database access in server components
  const data = await fetchData();

  return <ClientComponent initialData={data} />;
}
```

### Client Components

```typescript
// Mark client components explicitly
"use client";

import { useState, useEffect } from "react";

export function InteractiveComponent() {
  const [state, setState] = useState<string>("");

  // Client-side logic
  return <div>{state}</div>;
}
```

### Route Handlers

```typescript
// app/api/route/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  data: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = requestSchema.parse(body);

    // Process request
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

## Custom Hooks

### useEventStream

- Manages SSE connection to backend
- Handles reconnection with Last-Event-ID
- Processes streaming messages
- Updates UI state based on events

### useMessages

- Manages chat message state
- Handles message submission
- Manages attachments
- Syncs with backend

### useWorkflowTrigger

- Triggers AI generation workflows
- Manages pending states
- Handles error recovery

### useChatVisibility

- Controls chat panel visibility
- Auto-shows on new messages
- Handles focus management

## UI Component Patterns

### Multimodal Input

```typescript
interface MultimodalInputProps {
  type: "textarea" | "editor";
  chatId: string;
  message: string;
  setMessage: (message: string) => void;
  attachments: Attachment[];
  setAttachments: (attachments: Attachment[]) => void;
  handleSubmit: () => void;
  pendingMessage: PendingMessageStatus | null;
}
```

### Message Components

- Support for different message roles (user, assistant, tool)
- Rich content rendering (text, code, images)
- Tool result displays
- Attachment previews

### Canvas Nodes

- Custom node types for different declarations
- Status indicators (pending, completed, failed)
- Interactive tooltips with metadata
- Progress tracking

## Data Fetching

### Server-Side Data Fetching

```typescript
// In server components
async function getData(): Promise<DataType> {
  const res = await fetch("https://api.example.com/data", {
    cache: "no-store", // or 'force-cache'
    next: { revalidate: 3600 }, // ISR
  });

  if (!res.ok) {
    throw new Error("Failed to fetch data");
  }

  return res.json();
}
```

### Client-Side with tRPC

```typescript
// Use tRPC hooks for type-safe data fetching
const { data, isLoading, error } = api.projects.byId.useQuery({
  id: projectId,
});
```

## Error Handling

### Error Boundaries

```typescript
// app/error.tsx
"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  );
}
```

### Loading States

```typescript
// app/loading.tsx
export default function Loading() {
  return <LoadingSpinner />;
}
```

## Styling with Tailwind

### Using cn utility

```typescript
import { cn } from "@/lib/utils";

export function Component({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "base-classes here",
        "more-base-classes",
        className // User overrides last
      )}
    />
  );
}
```

### Component Variants with CVA

```typescript
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva("inline-flex items-center justify-center", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground",
      outline: "border border-input bg-background",
    },
    size: {
      default: "h-10 px-4 py-2",
      sm: "h-9 px-3",
      lg: "h-11 px-8",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});
```

## Authentication

### Better Auth Route Handler

```typescript
// src/app/api/auth/[...all]/route.ts
import { auth } from "@weldr/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

## API Route Patterns

- tRPC handler: `src/app/api/trpc/[trpc]/route.ts`
- Attachment uploads: `src/app/api/attachments/route.ts`
- Agent SSE proxy: `src/app/api/chat/[projectId]/[branchId]/stream/route.ts`

## Real-time Features

### SSE Streaming

```typescript
// Handle server-sent events for real-time updates
const eventSource = new EventSource(`/api/stream/${projectId}`);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Update UI based on event type
};

eventSource.onerror = () => {
  // Handle reconnection
};
```

### Optimistic Updates

```typescript
// Update UI optimistically while mutation is pending
const mutation = api.projects.update.useMutation({
  onMutate: async (newData) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ["projects"] });

    // Optimistically update
    const previousData = queryClient.getQueryData(["projects"]);
    queryClient.setQueryData(["projects"], newData);

    return { previousData };
  },
  onError: (err, newData, context) => {
    // Rollback on error
    queryClient.setQueryData(["projects"], context?.previousData);
  },
});
```

## Performance Optimization

### Image Optimization

```typescript
import Image from "next/image";

export function OptimizedImage() {
  return (
    <Image
      src="/image.jpg"
      alt="Description"
      width={500}
      height={300}
      priority // For above-the-fold images
      placeholder="blur"
      blurDataURL={dataUrl}
    />
  );
}
```

### Dynamic Imports

```typescript
import dynamic from "next/dynamic";

const HeavyComponent = dynamic(
  () => import("@/components/HeavyComponent"),
  {
    loading: () => <Skeleton />,
    ssr: false, // Disable SSR if needed
  }
);
```

### Memoization

```typescript
import { memo, useMemo, useCallback } from "react";

export const ExpensiveComponent = memo<ExpensiveComponentProps>(
  ({ data, onUpdate }) => {
    const processedData = useMemo(
      () => expensiveOperation(data),
      [data]
    );

    const handleClick = useCallback(
      (id: string) => {
        onUpdate(id);
      },
      [onUpdate]
    );

    return <div>{/* Render */}</div>;
  }
);
```

## Accessibility

### ARIA Attributes

```typescript
interface AccessibleButtonProps {
  isLoading?: boolean;
  label: string;
}

export function AccessibleButton({
  isLoading,
  label
}: AccessibleButtonProps) {
  return (
    <button
      aria-label={label}
      aria-busy={isLoading}
      aria-disabled={isLoading}
      disabled={isLoading}
    >
      {isLoading ? <Spinner aria-hidden="true" /> : label}
    </button>
  );
}
```

### Keyboard Navigation

```typescript
export function KeyboardNavigableList() {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        // Navigate down
        break;
      case "ArrowUp":
        // Navigate up
        break;
      case "Enter":
      case " ":
        // Select item
        break;
    }
  };

  return (
    <ul role="listbox" onKeyDown={handleKeyDown}>
      {/* Items */}
    </ul>
  );
}
```

## Environment Variables

### Type-Safe Environment Variables

```typescript
// env.ts
import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
  DATABASE_URL: z.string(),
  SECRET_KEY: z.string(),
});

export const env = envSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  SECRET_KEY: process.env.SECRET_KEY,
});
```

## Do's and Don'ts

### Do's

✅ Use TypeScript strict mode
✅ Define explicit prop types for all components
✅ Use Server Components by default
✅ Validate all forms with Zod
✅ Use tRPC for type-safe API calls
✅ Implement proper error boundaries
✅ Optimize images with next/image
✅ Use semantic HTML elements
✅ Implement proper loading states
✅ Handle authentication properly
✅ Stream real-time updates via SSE
✅ Implement version navigation

### Don'ts

❌ Use `any` type
❌ Mutate state directly
❌ Use inline styles (use Tailwind)
❌ Fetch data in useEffect without cleanup
❌ Block rendering with synchronous operations
❌ Ignore accessibility requirements
❌ Skip form validation
❌ Use client components unnecessarily
❌ Leave console.log in production
❌ Expose sensitive data in client code
