import { z } from "zod";

import { declarationSpecsV1Schema } from "./v1";

export const declarationSpecsSchema = z.discriminatedUnion("version", [declarationSpecsV1Schema]);

export const declarationSemanticDataSchema = z.object({
  summary: z
    .string()
    .describe(
      "A concise, technical one-line summary of what this declaration does. Focus on its primary purpose and functionality. Example: 'Creates authenticated HTTP clients with automatic token refresh'",
    ),
  description: z
    .string()
    .describe(
      "A clear 2-3 sentence explanation of the declaration's purpose, behavior, and key features. Include what problem it solves and how it fits into the larger system. Write for developers who need to understand when and why to use this.",
    ),
  tags: z
    .array(z.string())
    .describe(
      "Relevant technical tags that categorize this declaration's domain and functionality. Use lowercase, hyphenated terms. Examples: 'database', 'api-client', 'authentication', 'validation', 'ui-component', 'utility', 'middleware', 'configuration'",
    ),
  usagePattern: z.object({
    commonUseCases: z
      .array(z.string())
      .describe(
        "1-5 specific, realistic scenarios where developers would use this declaration. Focus on concrete use cases rather than abstract descriptions. Each should be a brief phrase describing the situation, like 'Building user authentication flows' or 'Validating API request payloads'",
      ),
    examples: z
      .array(
        z.object({
          code: z
            .string()
            .describe(
              "A practical, runnable code example showing typical usage. Include necessary imports and context. Keep it concise but complete enough to understand the usage pattern.",
            ),
          description: z
            .string()
            .describe(
              "A brief explanation of what the code example demonstrates, including any important details about the approach or outcome. Focus on the 'why' behind the example.",
            ),
        }),
      )
      .optional(),
    limitations: z
      .array(z.string())
      .optional()
      .describe(
        "Known constraints, edge cases, or scenarios where this declaration might not be suitable. Include performance considerations, browser/environment compatibility, or functional limitations. Be specific and actionable.",
      ),
    bestPractices: z
      .array(z.string())
      .optional()
      .describe(
        "Specific, actionable recommendations for using this declaration effectively. Include configuration tips, performance optimizations, security considerations, or integration patterns. Each should be implementable advice.",
      ),
    antiPatterns: z
      .array(z.string())
      .optional()
      .describe(
        "Common mistakes or misuses to avoid when using this declaration. Include specific examples of what not to do and why. Focus on errors that could cause bugs, performance issues, or maintainability problems.",
      ),
  }),
});
