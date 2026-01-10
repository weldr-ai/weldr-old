"use client";

import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { cva } from "class-variance-authority";
import type { JSONSchema7, JSONSchema7Definition } from "json-schema";
import { ChevronRight } from "lucide-react";
import React from "react";

import { cn, getDataTypeIcon } from "../lib/utils";

const treeVariants = cva(
  "group before:-z-10 before:absolute before:left-0 before:h-[2rem] before:w-full before:rounded-lg before:opacity-0 hover:before:opacity-100",
);

const selectedTreeVariants = cva("text-accent-foreground before:opacity-100");

interface TreeDataItem {
  id: string;
  name: string;
  type: "string" | "number" | "integer" | "array" | "boolean" | "object" | "null";
  description?: string;
  constraints?: string[];
  required?: boolean;
  enum?: (string | number | boolean | null)[];
  format?: string;
  icon?:
    | React.ElementType
    | {
        element: React.ElementType;
        className?: string;
      };
  selectedIcon?:
    | React.ElementType
    | {
        element: React.ElementType;
        className?: string;
      };
  openIcon?:
    | React.ElementType
    | {
        element: React.ElementType;
        className?: string;
      };
  children?: TreeDataItem[];
  actions?: React.ReactNode;
  onClick?: () => void;
}

function isJSONSchema7(schema: JSONSchema7Definition): schema is JSONSchema7 {
  return typeof schema !== "boolean";
}

// Helper function to convert JSON schema to TreeDataItem
export function schemaToTreeData(
  schema: JSONSchema7,
  name = "root",
  required = false,
): TreeDataItem[] {
  // Handle unitary schemas (schemas that describe a single value)
  if (
    schema.type &&
    !schema.properties &&
    !schema.items &&
    !schema.allOf &&
    !schema.anyOf &&
    !schema.oneOf
  ) {
    return [createTreeItem(schema, name, required)];
  }

  // Create the root item first
  const root = createTreeItem(schema, name, required);
  // Return root's children or empty array
  return root.children || [];
}

// Helper function to create a single tree item
function createTreeItem(
  schema: JSONSchema7Definition,
  name: string,
  required: boolean,
): TreeDataItem {
  // Handle boolean schema
  if (typeof schema === "boolean") {
    return {
      id: crypto.randomUUID(),
      name,
      type: "boolean",
      required,
      icon: getDataTypeIcon("boolean"),
    };
  }

  const item: TreeDataItem = {
    id: crypto.randomUUID(),
    name,
    type: (schema.type as TreeDataItem["type"]) || "object",
    required,
    icon: getDataTypeIcon((schema.type as TreeDataItem["type"]) || "object"),
  };

  if (schema.$ref) {
    item.description = `Reference: ${schema.$ref}`;
    return item;
  }

  if (schema.description) {
    item.description = schema.description;
  }

  if (schema.enum) {
    item.enum = schema.enum as (string | number | boolean | null)[];
  }

  if (schema.format) {
    item.format = schema.format;
  }

  // Add constraints based on schema properties
  const constraints: string[] = [];
  if (schema.minimum !== undefined) constraints.push(`min: ${schema.minimum}`);
  if (schema.maximum !== undefined) constraints.push(`max: ${schema.maximum}`);
  if (schema.minLength !== undefined) constraints.push(`minLength: ${schema.minLength}`);
  if (schema.maxLength !== undefined) constraints.push(`maxLength: ${schema.maxLength}`);
  if (schema.pattern) constraints.push(`pattern: ${schema.pattern}`);
  if (schema.format) constraints.push(`format: ${schema.format}`);
  if (schema.minItems !== undefined) constraints.push(`minItems: ${schema.minItems}`);
  if (schema.maxItems !== undefined) constraints.push(`maxItems: ${schema.maxItems}`);
  if (schema.uniqueItems) constraints.push("uniqueItems");
  if (constraints.length > 0) {
    item.constraints = constraints;
  }

  const children: TreeDataItem[] = [];

  // Handle nested properties for objects
  if (schema.properties) {
    children.push(
      ...Object.entries(schema.properties).map(([propName, propSchema]) =>
        createTreeItem(
          propSchema,
          propName,
          Array.isArray(schema.required) && schema.required.includes(propName),
        ),
      ),
    );
  }

  // Handle additional properties
  if (schema.additionalProperties && typeof schema.additionalProperties !== "boolean") {
    children.push(createTreeItem(schema.additionalProperties, "additionalProperties", false));
  }

  // Handle array items
  if (schema.items) {
    if (Array.isArray(schema.items)) {
      children.push(
        ...schema.items.map((itemSchema: JSONSchema7Definition, index: number) =>
          createTreeItem(itemSchema, `[${index}]`, false),
        ),
      );
    } else if (isJSONSchema7(schema.items)) {
      children.push(createTreeItem(schema.items, "items", false));
    }
  }

  // Handle combinations
  if (schema.allOf) {
    children.push(
      ...schema.allOf.map((s: JSONSchema7Definition, i: number) =>
        createTreeItem(s, `allOf[${i}]`, false),
      ),
    );
  }
  if (schema.anyOf) {
    children.push(
      ...schema.anyOf.map((s: JSONSchema7Definition, i: number) =>
        createTreeItem(s, `anyOf[${i}]`, false),
      ),
    );
  }
  if (schema.oneOf) {
    children.push(
      ...schema.oneOf.map((s: JSONSchema7Definition, i: number) =>
        createTreeItem(s, `oneOf[${i}]`, false),
      ),
    );
  }
  if (schema.not && isJSONSchema7(schema.not)) {
    children.push(createTreeItem(schema.not, "not", false));
  }

  if (children.length > 0) {
    item.children = children;
  }

  return item;
}

type TreeProps = React.HTMLAttributes<HTMLDivElement> & {
  data: TreeDataItem[] | TreeDataItem;
  initialSelectedItemId?: string;
  onSelectChange?: (item: TreeDataItem | undefined) => void;
  expandAll?: boolean;
  defaultNodeIcon?: React.ElementType;
  defaultLeafIcon?: React.ElementType;
};

const TreeView = React.forwardRef<HTMLDivElement, TreeProps>(
  (
    {
      data,
      initialSelectedItemId,
      onSelectChange,
      expandAll = true,
      defaultLeafIcon,
      defaultNodeIcon,
      className,
      ...props
    },
    ref,
  ) => {
    const [selectedItemId, setSelectedItemId] = React.useState<string | undefined>(
      initialSelectedItemId,
    );

    const handleSelectChange = React.useCallback(
      (item: TreeDataItem | undefined) => {
        setSelectedItemId(item?.id);
        if (onSelectChange) {
          onSelectChange(item);
        }
      },
      [onSelectChange],
    );

    const expandedItemIds = React.useMemo(() => {
      if (!initialSelectedItemId) {
        return [] as string[];
      }

      const ids: string[] = [];

      function walkTreeItems(items: TreeDataItem[] | TreeDataItem, targetId: string) {
        if (Array.isArray(items)) {
          for (const item of items) {
            ids.push(item.id);
            if (walkTreeItems(item, targetId) && !expandAll) {
              return true;
            }
            if (!expandAll) ids.pop();
          }
        } else if (!expandAll && items.id === targetId) {
          return true;
        } else if (items.children) {
          return walkTreeItems(items.children, targetId);
        }
        return false;
      }

      walkTreeItems(data, initialSelectedItemId);
      return ids;
    }, [data, expandAll, initialSelectedItemId]);

    const isFlat = React.useMemo(() => {
      function checkFlat(items: TreeDataItem[] | TreeDataItem): boolean {
        if (Array.isArray(items)) {
          return items.every((item) => !item.children);
        }
        return !items.children;
      }
      return checkFlat(data);
    }, [data]);

    // If data is a single item with name "root", render its children instead
    const renderData = React.useMemo(() => {
      if (!Array.isArray(data) && data.name === "root" && data.children) {
        return data.children;
      }
      return data;
    }, [data]);

    return (
      <div className={cn("relative overflow-hidden", className)}>
        <TreeItem
          data={renderData}
          ref={ref}
          selectedItemId={selectedItemId}
          handleSelectChange={handleSelectChange}
          expandedItemIds={expandedItemIds}
          defaultLeafIcon={defaultLeafIcon}
          defaultNodeIcon={defaultNodeIcon}
          isFlat={isFlat}
          {...props}
        />
      </div>
    );
  },
);

type TreeItemProps = TreeProps & {
  selectedItemId?: string;
  handleSelectChange: (item: TreeDataItem | undefined) => void;
  expandedItemIds: string[];
  defaultNodeIcon?: React.ElementType;
  defaultLeafIcon?: React.ElementType;
  isFlat: boolean;
};

const TreeItem = React.forwardRef<HTMLDivElement, TreeItemProps>(
  (
    {
      className,
      data,
      selectedItemId,
      handleSelectChange,
      expandedItemIds,
      defaultNodeIcon,
      defaultLeafIcon,
      isFlat,
      ...props
    },
    ref,
  ) => {
    if (!Array.isArray(data)) {
      data = [data];
    }
    return (
      <div ref={ref} role="tree" className={className} {...props}>
        <ul>
          {data.map((item) => (
            <li key={item.id}>
              {item.children ? (
                <TreeNode
                  item={item}
                  selectedItemId={selectedItemId}
                  expandedItemIds={expandedItemIds}
                  handleSelectChange={handleSelectChange}
                  defaultNodeIcon={defaultNodeIcon}
                  defaultLeafIcon={defaultLeafIcon}
                />
              ) : (
                <TreeLeaf
                  item={item}
                  selectedItemId={selectedItemId}
                  handleSelectChange={handleSelectChange}
                  defaultLeafIcon={defaultLeafIcon}
                  isFlat={isFlat}
                />
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  },
);

const TreeNode = ({
  item,
  handleSelectChange,
  expandedItemIds,
  selectedItemId,
  defaultNodeIcon,
  defaultLeafIcon,
}: {
  item: TreeDataItem;
  handleSelectChange: (item: TreeDataItem | undefined) => void;
  expandedItemIds: string[];
  selectedItemId?: string;
  defaultNodeIcon?: React.ElementType;
  defaultLeafIcon?: React.ElementType;
}) => {
  const [value, setValue] = React.useState(expandedItemIds.includes(item.id) ? [item.id] : []);
  return (
    <AccordionPrimitive.Root type="multiple" value={value} onValueChange={(s) => setValue(s)}>
      <AccordionPrimitive.Item value={item.id}>
        <AccordionTrigger
          className={cn(treeVariants(), selectedItemId === item.id && selectedTreeVariants())}
          onClick={() => {
            handleSelectChange(item);
            item.onClick?.();
          }}
        >
          <TreeIcon
            item={item}
            isSelected={selectedItemId === item.id}
            isOpen={value.includes(item.id)}
            default={defaultNodeIcon}
          />
          <span className="truncate text-sm">{item.name}</span>
          <TreeActions isSelected={selectedItemId === item.id}>{item.actions}</TreeActions>
        </AccordionTrigger>
        <AccordionContent className="ml-7 border-l pl-2">
          <TreeItem
            data={item.children ? item.children : item}
            selectedItemId={selectedItemId}
            handleSelectChange={handleSelectChange}
            expandedItemIds={expandedItemIds}
            defaultLeafIcon={defaultLeafIcon}
            defaultNodeIcon={defaultNodeIcon}
            isFlat={false}
          />
        </AccordionContent>
      </AccordionPrimitive.Item>
    </AccordionPrimitive.Root>
  );
};

const TreeLeaf = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    item: TreeDataItem;
    selectedItemId?: string;
    handleSelectChange: (item: TreeDataItem | undefined) => void;
    defaultLeafIcon?: React.ElementType;
    isFlat: boolean;
  }
>(
  (
    { className, item, selectedItemId, handleSelectChange, defaultLeafIcon, isFlat, ...props },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          isFlat ? "ml-0" : "ml-5",
          "flex cursor-pointer flex-col py-0.5 text-left before:right-1",
          treeVariants(),
          className,
          selectedItemId === item.id && selectedTreeVariants(),
        )}
        onClick={() => {
          handleSelectChange(item);
          item.onClick?.();
        }}
        {...props}
      >
        <div className="flex items-center">
          <TreeIcon item={item} isSelected={selectedItemId === item.id} default={defaultLeafIcon} />
          <div className="flex flex-grow items-center gap-2">
            <span className="truncate text-sm">
              {item.name}
              {item.required && <span className="text-destructive">*</span>}
            </span>
            {item.type && (
              <span className="text-muted-foreground text-xs">
                {item.type}
                {item.format && ` (${item.format})`}
              </span>
            )}
          </div>
          <TreeActions isSelected={selectedItemId === item.id}>{item.actions}</TreeActions>
        </div>
        <div className="ml-6">
          {item.description && (
            <div className="truncate text-muted-foreground text-xs">{item.description}</div>
          )}
          {item.constraints && item.constraints.length > 0 && (
            <div className="truncate text-muted-foreground text-xs">
              {item.constraints.join(", ")}
            </div>
          )}
          {item.enum && (
            <div className="truncate text-muted-foreground text-xs">
              enum: [{item.enum.map(String).join(", ")}]
            </div>
          )}
        </div>
      </div>
    );
  },
);

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header>
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        "flex w-full flex-1 items-center py-2 transition-all first:[&[data-state=open]>svg]:rotate-90",
        className,
      )}
      {...props}
    >
      <ChevronRight className="mr-1 h-4 w-4 shrink-0 text-accent-foreground/50 transition-transform duration-200" />
      {children}
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName;

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className={cn(
      "overflow-hidden text-sm transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down",
      className,
    )}
    {...props}
  >
    <div className="pt-0 pb-1">{children}</div>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = AccordionPrimitive.Content.displayName;

const TreeIcon = ({
  item,
  isOpen,
  isSelected,
  default: defaultIcon,
}: {
  item: TreeDataItem;
  isOpen?: boolean;
  isSelected?: boolean;
  default?: React.ElementType;
}) => {
  let Icon = defaultIcon;
  let iconClassName = "";

  if (isSelected && item.selectedIcon) {
    if (typeof item.selectedIcon === "object" && item.selectedIcon.element) {
      Icon = item.selectedIcon.element;
      iconClassName = item.selectedIcon.className || "";
    } else {
      Icon = item.selectedIcon as React.ElementType;
    }
  } else if (isOpen && item.openIcon) {
    if (typeof item.openIcon === "object" && item.openIcon.element) {
      Icon = item.openIcon.element;
      iconClassName = item.openIcon.className || "";
    } else {
      Icon = item.openIcon as React.ElementType;
    }
  } else if (item.icon) {
    if (typeof item.icon === "object" && item.icon.element) {
      Icon = item.icon.element;
      iconClassName = item.icon.className || "";
    } else {
      Icon = item.icon as React.ElementType;
    }
  }

  return Icon ? <Icon className={cn("mr-2 size-4 shrink-0 text-primary", iconClassName)} /> : null;
};

const TreeActions = ({
  children,
  isSelected,
}: {
  children: React.ReactNode;
  isSelected: boolean;
}) => {
  return (
    <div className={cn(isSelected ? "block" : "hidden", "absolute right-3 group-hover:block")}>
      {children}
    </div>
  );
};

export { TreeView, type TreeDataItem };
