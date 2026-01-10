import type { z } from "zod";

import type {
  declarationSemanticDataSchema,
  declarationSpecsSchema,
} from "../validators/declarations";
import type { dbModelDeclarationSpecsSchema } from "../validators/declarations/db-model";
import type { endpointDeclarationSpecsSchema } from "../validators/declarations/endpoint";
import type { pageDeclarationSpecsSchema } from "../validators/declarations/page";
import type { declarationSpecsV1Schema } from "../validators/declarations/v1";

export type DeclarationProgress = "pending" | "in_progress" | "enriching" | "completed";
export type DeclarationSpecs = z.infer<typeof declarationSpecsSchema>;
export type DeclarationSpecsV1 = z.infer<typeof declarationSpecsV1Schema>;
export type EndpointDeclarationSpecs = z.infer<typeof endpointDeclarationSpecsSchema>;
export type DbModelDeclarationSpecs = z.infer<typeof dbModelDeclarationSpecsSchema>;
export type PageDeclarationSpecs = z.infer<typeof pageDeclarationSpecsSchema>;

export type DeclarationSemanticData = z.infer<typeof declarationSemanticDataSchema>;

export interface DeclarationPosition {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export interface ExternalDependency {
  type: "external";
  packageName: string;
  importPath: string;
  dependsOn: string[];
}

export interface InternalDependency {
  type: "internal";
  filePath: string;
  dependsOn: string[];
}

export type Dependency = ExternalDependency | InternalDependency;

// Base interface for class members - extends declaration metadata with class-specific modifiers
interface BaseClassMemberMetadata extends Omit<
  BaseDeclarationCodeMetadata,
  "isExported" | "isDefault"
> {
  // Access modifiers specific to class members
  isStatic: boolean;
  isPrivate: boolean;
  isProtected: boolean;
}

// Property member
export interface PropertyMemberMetadata extends BaseClassMemberMetadata {
  type: "property";
  valueType: string;
  isReadonly: boolean;
  isOptional: boolean;
  initializer?: string;
}

// Method member
export interface MethodMemberMetadata extends BaseClassMemberMetadata {
  type: "method";
  isAsync: boolean;
  isAbstract: boolean;
  isGenerator: boolean;
  parameters: Array<{
    name: string;
    type: string;
    isOptional: boolean;
    isRest: boolean;
  }>;
  returnType: string;
}

// Simple enum member
export interface EnumMemberMetadata {
  name: string;
  initializer?: string;
  computedValue?: string | number;
}

// Base interface with common properties
interface BaseDeclarationCodeMetadata {
  name: string;
  isExported: boolean;
  isDefault?: boolean;
  position: DeclarationPosition;
  dependencies: Dependency[];
  uri: string;
  typeSignature?: string;
  typeParameters?: string[];
}

// Function declaration
export interface FunctionDeclarationCodeMetadata extends BaseDeclarationCodeMetadata {
  type: "function";
  isAsync?: boolean;
  isGenerator?: boolean;
  parameters?: Array<{
    name: string;
    type: string;
    isOptional: boolean;
    isRest: boolean;
  }>;
  returnType?: string;
}

// Constructor member
export interface ConstructorMemberMetadata extends BaseClassMemberMetadata {
  type: "constructor";
  parameters: Array<{
    name: string;
    type: string;
    isOptional: boolean;
    isRest: boolean;
  }>;
}

// Getter member
export interface GetterMemberMetadata extends BaseClassMemberMetadata {
  type: "getter";
  returnType: string;
}

// Setter member
export interface SetterMemberMetadata extends BaseClassMemberMetadata {
  type: "setter";
  parameter: {
    name: string;
    type: string;
  };
}

// Class declaration
export interface ClassDeclarationCodeMetadata extends BaseDeclarationCodeMetadata {
  type: "class";
  extends?: string;
  implements?: string[];
  constructor?: ConstructorMemberMetadata;
  methods?: MethodMemberMetadata[];
  properties?: PropertyMemberMetadata[];
  getters?: GetterMemberMetadata[];
  setters?: SetterMemberMetadata[];
}

// Interface declaration
export interface InterfaceDeclarationCodeMetadata extends BaseDeclarationCodeMetadata {
  type: "interface";
  extends?: string[];
}

// Type declaration
export interface TypeDeclarationCodeMetadata extends BaseDeclarationCodeMetadata {
  type: "type";
}

// Variable declarations (const, let, var)
export interface VariableDeclarationCodeMetadata extends BaseDeclarationCodeMetadata {
  type: "const" | "let" | "var";
}

// Enum declaration
export interface EnumDeclarationCodeMetadata extends BaseDeclarationCodeMetadata {
  type: "enum";
  enumMembers: EnumMemberMetadata[];
}

// Namespace declaration
export interface NamespaceDeclarationCodeMetadata extends BaseDeclarationCodeMetadata {
  type: "namespace";
}

// Re-export declaration
export interface ReExportDeclarationCodeMetadata extends BaseDeclarationCodeMetadata {
  type:
    | "function"
    | "class"
    | "interface"
    | "type"
    | "const"
    | "let"
    | "var"
    | "enum"
    | "namespace";
  isReExport: true;
  reExportSource: string;
}

// Discriminated union
export type DeclarationCodeMetadata =
  | FunctionDeclarationCodeMetadata
  | ClassDeclarationCodeMetadata
  | InterfaceDeclarationCodeMetadata
  | TypeDeclarationCodeMetadata
  | VariableDeclarationCodeMetadata
  | EnumDeclarationCodeMetadata
  | NamespaceDeclarationCodeMetadata
  | ReExportDeclarationCodeMetadata
  | MethodMemberMetadata
  | PropertyMemberMetadata
  | ConstructorMemberMetadata
  | GetterMemberMetadata
  | SetterMemberMetadata;

export interface DeclarationMetadataV1 {
  version: "v1";
  codeMetadata?: DeclarationCodeMetadata;
  semanticData?: DeclarationSemanticData;
  specs?: DeclarationSpecs["data"];
}

export type DeclarationMetadata = DeclarationMetadataV1;
