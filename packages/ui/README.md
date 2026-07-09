# `@weldr/ui`

Reusable UI component library for the Weldr platform built with shadcn/ui and Tailwind CSS.

## Overview

This package provides a comprehensive set of reusable React components built on top of Base UI primitives and styled with Tailwind CSS. It follows the shadcn/ui pattern and includes components for forms, navigation, data display, feedback, and more.

## Installation

This package is part of the Weldr monorepo and uses workspace protocol:

```json
{
  "dependencies": {
    "@weldr/ui": "workspace:*"
  }
}
```

## Usage

### Import Components

```typescript
import { Button } from "@weldr/ui/components/button";
import { Card } from "@weldr/ui/components/card";
import { Input } from "@weldr/ui/components/input";
```

### Import Styles

```typescript
import "@weldr/ui/styles/globals.css";
```

### Import Icons

```typescript
import { IconName } from "@weldr/ui/icons";
```

### Import Hooks

```typescript
import { useToast } from "@weldr/ui/hooks/use-toast";
import { useMobile } from "@weldr/ui/hooks/use-mobile";
```

## Available Components

### Form Components

- `Button` - Button component with variants
- `Input` - Text input component
- `Label` - Form label component
- `Textarea` - Textarea component
- `Select` - Select dropdown component
- `Checkbox` - Checkbox component
- `RadioGroup` - Radio group component
- `Switch` - Toggle switch component
- `Slider` - Slider component

### Layout Components

- `Card` - Card container component
- `Separator` - Visual separator component
- `ScrollArea` - Scrollable area component
- `Resizable` - Resizable panel component
- `AspectRatio` - Aspect ratio container

### Navigation Components

- `Tabs` - Tab navigation component
- `Accordion` - Accordion component
- `Menubar` - Menu bar component
- `NavigationMenu` - Navigation menu component
- `Breadcrumb` - Breadcrumb navigation

### Data Display Components

- `Table` - Table component
- `Badge` - Badge component
- `Avatar` - Avatar component
- `Progress` - Progress bar component

### Feedback Components

- `Alert` - Alert component
- `AlertDialog` - Alert dialog component
- `Dialog` - Dialog/modal component
- `Toast` - Toast notification component
- `Popover` - Popover component
- `Tooltip` - Tooltip component

### Other Components

- `DropdownMenu` - Dropdown menu component
- `ContextMenu` - Context menu component
- `HoverCard` - Hover card component
- `Collapsible` - Collapsible component
- `Toggle` - Toggle button component
- `ToggleGroup` - Toggle group component
- `Command` - Command palette component
- `Calendar` - Calendar component
- `DatePicker` - Date picker component
- `Carousel` - Carousel component
- `Chart` - Chart component

## Icons

Icons are exported from `@weldr/ui/icons`:

```typescript
import {
  IconName,
  IconName2,
  // ... other icons
} from "@weldr/ui/icons";
```

## Hooks

### useToast

```typescript
import { useToast } from "@weldr/ui/hooks/use-toast";

function MyComponent() {
  const { toast } = useToast();

  const handleClick = () => {
    toast({
      title: "Success",
      description: "Operation completed",
    });
  };
}
```

### useMobile

```typescript
import { useMobile } from "@weldr/ui/hooks/use-mobile";

function MyComponent() {
  const isMobile = useMobile();

  return <div>{isMobile ? "Mobile" : "Desktop"}</div>;
}
```

## Styling

Components are styled with Tailwind CSS. You can customize them by:

1. Modifying Tailwind configuration
2. Using component variants
3. Adding custom classes

## Adding New Components

Use shadcn/ui CLI to add new components:

```bash
bun add-component
```

Or manually add components following the shadcn/ui pattern.

## Type Safety

All components are fully typed with TypeScript and include proper prop types:

```typescript
import type { ButtonProps } from "@weldr/ui/components/button";

const MyButton: React.FC<ButtonProps> = (props) => {
  return <Button {...props} />;
};
```

## Related Packages

- `@weldr/web` - Web application using these components
- `@weldr/shared` - Shared utilities and types
