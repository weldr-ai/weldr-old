import { z } from "zod";

import { declarationSpecsSchema } from "@weldr/shared/validators/declarations/index";

export const declarationSpecsWithDependenciesSchema = declarationSpecsSchema.and(
  z.object({
    dependencies: z
      .object({
        internal: z
          .object({
            importPath: z
              .string()
              .optional()
              .describe(
                "The absolute path to the file containing the declaration. Alias @/web and @/server imports are resolved to /src/web and /src/server respectively",
              ),
            dependsOn: z
              .array(z.string())
              .describe("The list of declarations imported from that path"),
          })
          .array()
          .describe("A list of internal files that this declaration depends on"),
        external: z
          .object({
            name: z.string().describe("The package name"),
            importPath: z.string().describe("The import path"),
            dependsOn: z
              .array(z.string())
              .describe("The list of declarations imported from that path"),
          })
          .array()
          .describe("A list of npm packages that this declaration depends on"),
      })
      .describe(
        "A list of dependencies for the declaration. Internal dependencies are files in the project, and external dependencies are npm packages.",
      ),
  }),
);

export const enricherAgentOutputSchema = z.object({
  declarations: declarationSpecsWithDependenciesSchema
    .array()
    .describe("The list of declaration specs for the current file"),
  metadata: z
    .object({
      updatedDeclarations: z
        .string()
        .array()
        .describe("The list of declarations that have been updated"),
      deletedDeclarations: z
        .string()
        .array()
        .describe("The list of declarations that have been deleted"),
    })
    .describe("The metadata for the current file"),
});
