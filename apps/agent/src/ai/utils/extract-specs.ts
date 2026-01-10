import { generateObject } from "ai";
import type { z } from "zod";

import { Logger } from "@weldr/shared/logger";
import type { DeclarationCodeMetadata } from "@weldr/shared/types/declarations";
import { dbModelDeclarationSpecsSchema } from "@weldr/shared/validators/declarations/db-model";
import { endpointDeclarationSpecsSchema } from "@weldr/shared/validators/declarations/endpoint";
import { pageDeclarationSpecsSchema } from "@weldr/shared/validators/declarations/page";

import { registry } from "./registry";

export type SpecType = "db-model" | "endpoint" | "page";

export type ExtractedSpecs =
  | z.infer<typeof dbModelDeclarationSpecsSchema>
  | z.infer<typeof endpointDeclarationSpecsSchema>
  | z.infer<typeof pageDeclarationSpecsSchema>;

/**
 * Detect if a file contains a high-level declaration based on path and content.
 * Returns the spec type if detected, or null if not a high-level declaration.
 */
export function detectSpecType(filePath: string, sourceCode: string): SpecType | null {
  // Database models - Drizzle schemas
  if (
    (filePath.includes("/db/schema") || filePath.includes("/schema/")) &&
    (sourceCode.includes("pgTable") || sourceCode.includes("sqliteTable"))
  ) {
    return "db-model";
  }

  // API endpoints - oRPC routes
  if (
    filePath.includes("/routes/") &&
    !filePath.includes("/web/") &&
    !filePath.includes("apps/web/") &&
    (sourceCode.includes(".route(") ||
      sourceCode.includes("publicProcedure") ||
      sourceCode.includes("protectedProcedure"))
  ) {
    return "endpoint";
  }

  // Pages - React routes (TanStack Start / Next.js style)
  if (
    (filePath.includes("/routes/") &&
      (filePath.includes("/web/") || filePath.includes("apps/web/"))) ||
    filePath.includes("/pages/")
  ) {
    // Must have a component export (default export or named Route)
    if (sourceCode.includes("export default") || sourceCode.includes("createFileRoute")) {
      return "page";
    }
  }

  return null;
}

const schemaMap = {
  "db-model": dbModelDeclarationSpecsSchema,
  endpoint: endpointDeclarationSpecsSchema,
  page: pageDeclarationSpecsSchema,
};

const promptMap: Record<SpecType, string> = {
  "db-model": `Analyze this Drizzle database schema and extract the db-model specification.
Extract:
- Table name (lowercase, snake_case, plural)
- All columns with their types, constraints (required, nullable, unique, default, primary key)
- Relationships to other tables (if any foreign keys)
- Indexes (if defined)

Be precise about the column types - use the actual Drizzle types like "uuid", "text", "varchar", "timestamp", "integer", "serial", etc.`,

  endpoint: `Analyze this API endpoint and extract the endpoint specification.
Extract:
- HTTP method (get, post, put, delete, patch)
- Path pattern (e.g., /users/{id}) - use {param} for path parameters
- Summary and description (from the route definition or infer from the handler)
- Parameters (path, query, header) if any
- Request body schema (if POST/PUT/PATCH) - analyze the input schema
- Response schemas by status code - analyze the output schema
- Whether it's protected (uses protectedProcedure = true, publicProcedure = false)
- Tags (from the route definition if present)`,

  page: `Analyze this React page component and extract the page specification.
Extract:
- Human-friendly page name (e.g., "User Profile", "Dashboard", "Login")
- Route path (e.g., /users/{id}, /dashboard) - use {param} for dynamic segments
- Whether it's protected (look for auth checks, protected routes, or redirects to login)
- Description of what the page does
- URL parameters if any (from the route path or params validation)`,
};

/**
 * Check if a declaration should have specs extracted.
 * Only default exports or main declarations in the file are eligible.
 */
export function isEligibleForSpecExtraction(
  declaration: DeclarationCodeMetadata,
  filePath: string,
  sourceCode: string,
): boolean {
  // Only check spec-eligible files
  const specType = detectSpecType(filePath, sourceCode);
  if (!specType) {
    return false;
  }

  // For endpoints and pages, we mainly care about default exports or Route exports
  if (specType === "endpoint" || specType === "page") {
    // Default exports are the main declaration
    if ("isDefault" in declaration && declaration.isDefault) {
      return true;
    }
    // TanStack Router uses named "Route" export
    if (declaration.name === "Route" && specType === "page") {
      return true;
    }
    // oRPC uses "route" const
    if (declaration.name === "route" && specType === "endpoint") {
      return true;
    }
    return false;
  }

  // For db-models, we want the table definition (usually a const with pgTable/sqliteTable)
  if (specType === "db-model") {
    // The main table definition
    if (
      declaration.type === "const" &&
      !declaration.name.endsWith("Relations") &&
      !declaration.name.startsWith("_")
    ) {
      return true;
    }
    return false;
  }

  return false;
}

/**
 * Extract high-level specs from code using AI.
 * Returns the extracted specs or null if extraction fails or isn't applicable.
 */
export async function extractSpecsFromCode(
  declaration: DeclarationCodeMetadata,
  filePath: string,
  sourceCode: string,
): Promise<ExtractedSpecs | null> {
  const logger = Logger.get({
    declarationName: declaration.name,
    filePath,
  });

  // Check if this declaration is eligible for spec extraction
  if (!isEligibleForSpecExtraction(declaration, filePath, sourceCode)) {
    return null;
  }

  const specType = detectSpecType(filePath, sourceCode);
  if (!specType) {
    return null;
  }

  logger.info(`Detected ${specType} spec type, extracting...`);

  try {
    const result = await generateObject({
      model: registry.languageModel("google:gemini-2.5-flash"),
      schema: schemaMap[specType],
      prompt: `${promptMap[specType]}

Source Code:
File: ${filePath}
\`\`\`typescript
${sourceCode}
\`\`\`

Generate the complete ${specType} specification based on the actual implementation.
Focus on the declaration named "${declaration.name}" if multiple declarations exist.`,
    });

    logger.info(`Successfully extracted ${specType} specs`);
    return result.object;
  } catch (error) {
    logger.error("Failed to extract specs from code", {
      extra: { error: error instanceof Error ? error.message : String(error) },
    });
    return null;
  }
}
