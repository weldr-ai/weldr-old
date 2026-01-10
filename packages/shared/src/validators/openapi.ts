import { z } from "zod";

import { jsonSchema } from "./json-schema";

// HTTP Methods supported by the endpoint
export const httpMethodSchema = z
  .enum(["get", "put", "post", "delete", "patch", "options", "head"])
  .describe("The HTTP method for the endpoint");

// Where parameters can be located in the request
export const parameterInSchema = z
  .enum([
    "query", // In the URL query string
    "header", // In HTTP headers
    "path", // In the URL path
    "cookie", // In cookies
  ])
  .describe("Specifies where the parameter is located in the request");

// Parameter Object - Describes a single parameter
export const parameterObjectSchema = z.object({
  name: z.string().describe("The name of the parameter (e.g., 'userId', 'sortBy')"),
  in: parameterInSchema,
  description: z
    .string()
    .optional()
    .describe("A detailed explanation of the parameter's purpose and usage"),
  required: z
    .boolean()
    .optional()
    .describe("Whether this parameter is mandatory (defaults to false)"),
  schema: jsonSchema.describe(
    "JSON Schema defining the type and validation rules for the parameter",
  ),
});

// Content Type Media Types
export const contentTypeSchema = z
  .enum([
    "application/json",
    "application/xml",
    "application/x-www-form-urlencoded",
    "multipart/form-data",
    "text/plain",
    "text/html",
    "application/octet-stream",
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/gif",
  ])
  .describe("Common HTTP content types");

const allowedContentTypes = new Set<string>(contentTypeSchema.options);

const contentObjectSchema = z
  .record(
    z.string(),
    z.object({
      schema: jsonSchema.describe(
        "JSON Schema defining the structure and validation rules for this content type",
      ),
      example: z
        .unknown()
        .optional()
        .describe("An example of a valid request payload for this content type"),
    }),
  )
  .superRefine((value, ctx) => {
    for (const [key] of Object.entries(value)) {
      if (!allowedContentTypes.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unsupported content type: ${key}`,
          path: [key],
        });
      }
    }
  });

// Request Body Object - Describes the request payload
export const requestBodyObjectSchema = z.object({
  description: z.string().optional().describe("A detailed explanation of the request body"),
  required: z
    .boolean()
    .optional()
    .describe("Whether the request body is required (defaults to false)"),
  content: contentObjectSchema.describe(
    "Request body specifications for different content types (e.g., application/json)",
  ),
});

// Response Object - Describes possible responses
export const responseObjectSchema = z.object({
  description: z.string().describe("A detailed explanation of when this response is returned"),
  content: contentObjectSchema
    .optional()
    .describe("Response specifications for different content types (e.g., application/json)"),
});

// Security Requirement Object - Describes required security schemes
export const securityRequirementSchema = z
  .record(z.string(), z.array(z.string()))
  .describe("Security schemes required for this endpoint, with arrays of required scopes");

// OpenAPI Endpoint Schema - Complete endpoint specification
export const openApiEndpointSpecSchema = z.object({
  method: httpMethodSchema,
  path: z.string().describe("The URL path pattern (e.g., '/users/{userId}/posts')"),
  summary: z.string().describe("A short summary of what the operation does (1-2 lines)"),
  description: z
    .string()
    .describe(
      "A verbose explanation of the operation's behavior. Can include markdown formatting and detailed information about edge cases, notes, and examples.",
    ),
  tags: z
    .array(z.string())
    .optional()
    .describe("Tags for organizing and categorizing the endpoint (e.g., ['users', 'admin'])"),
  parameters: z
    .array(parameterObjectSchema)
    .optional()
    .describe("List of parameters that can be used with this endpoint"),
  requestBody: requestBodyObjectSchema
    .optional()
    .describe("Specification of the request body, if this endpoint accepts one"),
  responses: z
    .record(z.string(), responseObjectSchema)
    .describe("Possible responses indexed by HTTP status code (e.g., '200', '400', '404')"),
  security: z
    .array(securityRequirementSchema)
    .optional()
    .describe("Security requirements for this specific endpoint"),
});
