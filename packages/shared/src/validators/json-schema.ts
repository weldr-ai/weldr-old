import { z } from "zod";

// JSON Schema Data Types
export const dataTypeSchema = z
  .union([
    z.string().describe("TypeScript type literal"),
    z.enum(["string", "number", "integer", "boolean", "object", "array", "null"]),
    z.array(z.enum(["string", "number", "integer", "boolean", "object", "array", "null"])),
  ])
  .describe("The data type of a JSON Schema value");

// Basic value types that can be used in enum and const
export const basicValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

// Schema for simple validations (no nested schemas)
export const simpleValidationSchema = z.object({
  // Basic schema properties
  type: dataTypeSchema.optional(),
  title: z.string().optional(),
  description: z.string().optional(),

  // String validations
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().nonnegative().optional(),
  pattern: z.string().optional(),
  format: z.string().optional(),

  // Number validations
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  exclusiveMinimum: z.number().optional(),
  exclusiveMaximum: z.number().optional(),
  multipleOf: z.number().positive().optional(),

  // Enum and const
  enum: z.array(basicValueSchema).optional(),
  const: basicValueSchema.optional(),

  // Schema metadata
  $id: z.string().optional(),
  $schema: z.string().optional(),
  $ref: z.string().optional(),
  $comment: z.string().optional(),

  // Content
  contentMediaType: z.string().optional(),
  contentEncoding: z.string().optional(),

  // Additional metadata
  readOnly: z.boolean().optional(),
  writeOnly: z.boolean().optional(),
  examples: z.array(z.unknown()).optional(),
  default: z.unknown().optional(),
});

// Final JSON Schema without recursion
export const jsonSchema = simpleValidationSchema.extend({
  // For objects
  required: z.array(z.string()).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  additionalProperties: z.union([z.boolean(), z.unknown()]).optional(),

  // For arrays
  items: z
    .union([z.unknown(), z.array(z.unknown())])

    .optional(),
  minItems: z.number().int().positive().optional(),
  maxItems: z.number().int().positive().optional(),
  uniqueItems: z.boolean().optional(),

  // Combiners
  oneOf: z.array(z.unknown()).optional(),
  unknownOf: z.array(z.unknown()).optional(),
  allOf: z.array(z.unknown()).optional(),
  not: z.unknown().optional(),

  // Conditionals
  if: z.unknown().optional(),
  // oxlint-disable-next-line no-thenable
  then: z.unknown().optional(),
  else: z.unknown().optional(),

  // Schema definitions
  $defs: z.record(z.string(), z.unknown()).optional(),
  definitions: z.record(z.string(), z.unknown()).optional(),
});
