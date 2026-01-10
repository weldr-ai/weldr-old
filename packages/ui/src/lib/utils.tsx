import { type ClassValue, clsx } from "clsx";
import {
  BanIcon,
  BinaryIcon,
  BracesIcon,
  BracketsIcon,
  HashIcon,
  Layers3Icon,
  TextIcon,
} from "lucide-react";
import { twMerge } from "tailwind-merge";

export type PrimitiveDataType =
  | "string"
  | "number"
  | "integer"
  | "array"
  | "boolean"
  | "object"
  | "null";

export type DataType = PrimitiveDataType | Array<PrimitiveDataType> | string;

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function getDataTypeIcon(type: DataType) {
  if (
    typeof type === "string" &&
    !["string", "number", "integer", "array", "boolean", "object", "null"].includes(type)
  ) {
    return Layers3Icon;
  }

  switch (type) {
    case "string":
      return TextIcon;
    case "number":
    case "integer":
      return HashIcon;
    case "boolean":
      return BinaryIcon;
    case "array":
      return BracketsIcon;
    case "object":
      return BracesIcon;
    case "null":
      return BanIcon;
    default:
      return BracesIcon;
  }
}

export function renderDataTypeIcon(type: DataType) {
  const Icon = getDataTypeIcon(type);
  return <Icon className="mr-2 size-4 shrink-0 text-primary" />;
}
