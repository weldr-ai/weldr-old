# UI Package Development Guidelines

## Overview
The @weldr/ui package provides the component library for Weldr applications. It follows shadcn/ui patterns with Radix UI primitives, Tailwind CSS styling, and class-variance-authority (CVA) for variants.

## Type Safety Requirements

### Component Props
```typescript
// ALWAYS define explicit prop types
interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
```

### Radix Component Wrapping
```typescript
"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";

// Wrap Radix primitives with proper typing
function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Content
      data-slot="dialog-content"
      className={cn("...", className)}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  );
}
```

## Component Patterns

### Simple Components
```typescript
function Input({
  className,
  type,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1",
        "text-base shadow-xs transition-colors",
        "placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}
```

### Variant-Based Components (CVA)
```typescript
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  // Base styles
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-6",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

// Export variants for reuse
export { Button, buttonVariants };
```

### Compound Components (Context)
```typescript
const SidebarContext = React.createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>({ open: true, setOpen: () => {} });

function SidebarProvider({
  children,
  defaultOpen = true,
}: {
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <SidebarContext.Provider value={{ open, setOpen }}>
      {children}
    </SidebarContext.Provider>
  );
}

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within SidebarProvider");
  }
  return context;
}
```

### forwardRef Pattern
```typescript
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="card"
    className={cn("rounded-xl border bg-card text-card-foreground shadow-sm", className)}
    {...props}
  />
));
Card.displayName = "Card";
```

## Styling Patterns

### Using cn Utility
```typescript
import { cn } from "../lib/utils";

// Merge classes with proper precedence
<div
  className={cn(
    "base-classes here",
    condition && "conditional-class",
    className, // User overrides last
  )}
/>
```

### CSS Variables (Theme System)
```css
/* globals.css */
:root {
  --background: oklch(0.99 0 286.38);
  --foreground: oklch(0.24 0.01 248.23);
  --primary: oklch(0.54 0.19 267.01);
  --secondary: oklch(0.93 0.01 286.3);
  --destructive: oklch(0.63 0.19 23.03);
  --muted: oklch(0.96 0 286.32);
  --accent: oklch(0.93 0.01 286.3);
  --border: oklch(0.89 0.01 286.2);
  --ring: oklch(0.54 0.19 267.01);
  --radius: 0.5rem;
}

.dark {
  --background: oklch(0.15 0.01 286.38);
  --foreground: oklch(0.97 0 0);
  /* ... dark mode overrides */
}
```

### Common Styling Patterns
```typescript
// State animations
"data-[state=open]:animate-in data-[state=closed]:animate-out"
"data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"

// Focus states
"focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"

// Disabled states
"disabled:pointer-events-none disabled:opacity-50"

// Aria/validation states
"aria-invalid:border-destructive aria-invalid:ring-destructive/20"

// Dark mode
"dark:bg-input/30 dark:hover:bg-accent/50"

// SVG sizing
"[&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0"
```

## Icon Organization

### Icon Pattern
```typescript
import type { ComponentProps } from "react";

export function TypescriptIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <title>TypeScript</title>
      <path d="..." />
    </svg>
  );
}
```

### Theme-Aware Icons
```typescript
export function GithubIcon({
  theme = "dark",
  ...props
}: ComponentProps<"svg"> & { theme?: "light" | "dark" }) {
  return theme === "light" ? (
    <svg {...props}>{/* Light version */}</svg>
  ) : (
    <svg {...props}>{/* Dark version */}</svg>
  );
}
```

### Icon Export Pattern
```typescript
// src/icons/index.ts
export { GithubIcon } from "./github-icon";
export { GoogleIcon } from "./google-icon";
export { LogoIcon } from "./logo-icon";
export { TypescriptIcon } from "./typescript-icon";
// ... all icons exported from barrel file
```

## Hooks

### useIsMobile
```typescript
import { useIsMobile } from "@weldr/ui/hooks/use-mobile";

function ResponsiveComponent() {
  const isMobile = useIsMobile();

  return isMobile ? <MobileView /> : <DesktopView />;
}
```

### useToast
```typescript
import { useToast } from "@weldr/ui/hooks/use-toast";

function MyComponent() {
  const { toast, dismiss } = useToast();

  const handleAction = () => {
    toast({
      title: "Success",
      description: "Action completed",
    });
  };
}
```

## Package Exports

```json
{
  "exports": {
    "./styles/globals.css": "./src/styles/globals.css",
    "./styles/canvas.css": "./src/styles/canvas.css",
    "./lib/*": "./src/lib/*.tsx",
    "./components/*": "./src/components/*.tsx",
    "./hooks/*": "./src/hooks/*.ts",
    "./icons": "./src/icons/index.ts"
  }
}
```

### Import Patterns
```typescript
// Components
import { Button } from "@weldr/ui/components/button";
import { Dialog, DialogContent } from "@weldr/ui/components/dialog";

// Hooks
import { useIsMobile } from "@weldr/ui/hooks/use-mobile";

// Icons
import { GithubIcon, LogoIcon } from "@weldr/ui/icons";

// Utilities
import { cn } from "@weldr/ui/lib/utils";

// Styles (in app entry)
import "@weldr/ui/styles/globals.css";
```

## Adding Components

### Using shadcn CLI
```bash
# Add a new shadcn component
bun add-component <component-name>

# This runs: bunx --bun shadcn@latest add <component-name>
```

### Component Checklist
- [ ] Define TypeScript props interface
- [ ] Add `data-slot` attribute for identification
- [ ] Use `cn()` for class merging
- [ ] Support `className` prop for customization
- [ ] Use CVA for variants when applicable
- [ ] Add `"use client"` directive if needed
- [ ] Export from component file
- [ ] Use semantic color variables
- [ ] Add proper focus/disabled states
- [ ] Support `asChild` pattern if composition needed

## Component List

### Core Components (56)
accordion, alert, alert-dialog, avatar, badge, breadcrumb,
button, calendar, card, carousel, chart, checkbox,
collapsible, command, context-menu, dialog, drawer, dropdown-menu,
expandable-card, form, hover-card, input, input-otp, label,
menubar, navigation-menu, pagination, popover, progress,
radio-group, resizable, scroll-area, select, separator,
sheet, sidebar, skeleton, slider, sonner, switch,
table, tabs, textarea, toast, toaster, toggle, toggle-group,
tooltip, tree-view, visually-hidden

### Custom Icons (47)
Brand icons (GitHub, Google, Slack, Discord, Linear, etc.),
Technology icons (TypeScript, JavaScript, Tailwind, Postgres),
Custom icons (LogoIcon, GradientSparklesIcon, etc.)

## Dependencies

### Core Dependencies
- `@radix-ui/react-*` - Radix UI primitives
- `class-variance-authority` - Variant styling
- `clsx` - Class name construction
- `tailwind-merge` - Tailwind class merging
- `lucide-react` - Icon library

### Form/Interaction
- `react-hook-form` - Form handling
- `zod` - Validation
- `cmdk` - Command menu
- `vaul` - Drawer component

### Utilities
- `sonner` - Toast notifications
- `recharts` - Charts
- `next-themes` - Theme switching

## Do's and Don'ts

### Do's
- Use `data-slot` attributes for component identification
- Use `cn()` for all class merging
- Support `className` prop for customization
- Use CVA for components with variants
- Follow existing component patterns
- Use semantic color variables (bg-primary, text-muted-foreground)
- Add proper accessibility attributes
- Use forwardRef for components that need ref access
- Export both component and variants (when applicable)

### Don'ts
- Use `any` type for props
- Hardcode colors (use CSS variables)
- Skip accessibility attributes
- Create components without `data-slot`
- Use inline styles (use Tailwind)
- Forget `"use client"` for interactive components
- Skip disabled/focus states
- Create duplicate components
- Use non-semantic class names
