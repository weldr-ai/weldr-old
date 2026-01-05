import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { db } from "@weldr/db";
import {
  environmentVariables,
  integrationEnvironmentVariables,
  secrets,
} from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";
import { getBranchDir } from "@weldr/shared/state";

import type { IntegrationPackageSets } from "@/integrations/types";
import { defineIntegration } from "@/integrations/utils/define-integration";
import { runCommand } from "@/lib/commands";

export const betterAuthIntegration = defineIntegration<"better-auth">({
  category: "authentication",
  key: "better-auth",
  name: "Better-Auth",
  description:
    "Modern, self-hosted authentication solution with complete user management, social logins, and session handling.",
  version: "1.0.0",
  allowMultiple: false,
  options: {
    socialProviders: ["github", "google", "microsoft"],
    plugins: ["admin", "oAuthProxy", "openAPI", "organization", "stripe"],
    emailVerification: true,
    emailAndPassword: true,
    stripeIntegration: true,
  },
  recommendedOptions: null,
  variables: [
    {
      name: "BETTER_AUTH_SECRET",
      source: "system",
      isRequired: true,
      target: ["server"],
    },
  ],
  isRecommended: true,
  packages: async (context) => {
    const project = context.get("project");
    const hasFrontend = project.integrationCategories.has("frontend");

    const packages: IntegrationPackageSets = [
      {
        target: "server",
        runtime: {
          "better-auth": "^1.3.34",
        },
        development: {},
      },
    ];

    if (hasFrontend) {
      packages.push({
        target: "web",
        runtime: {
          "better-auth": "^1.3.34",
        },
        development: {},
      });
    }

    return packages;
  },

  postInstall: async ({ context, integration }) => {
    const project = context.get("project");
    const branch = context.get("branch");
    const user = context.get("user");
    const branchDir = getBranchDir(project.id, branch.id);

    try {
      // Store secret in database
      await db.transaction(async (tx) => {
        const BETTER_AUTH_SECRET = randomBytes(32).toString("base64");

        const [secret] = await tx
          .insert(secrets)
          .values({
            secret: BETTER_AUTH_SECRET,
          })
          .returning();

        if (!secret) {
          throw new Error("Failed to generate secret");
        }

        const [environmentVariable] = await tx
          .insert(environmentVariables)
          .values({
            key: "BETTER_AUTH_SECRET",
            projectId: project.id,
            userId: user.id,
            secretId: secret.id,
          })
          .returning();

        if (!environmentVariable) {
          throw new Error("Failed to generate environment variable");
        }

        await tx.insert(integrationEnvironmentVariables).values({
          integrationId: integration.id,
          mapTo: "BETTER_AUTH_SECRET",
          environmentVariableId: environmentVariable.id,
        });
      });

      // Check if schema/index.ts exists and is empty
      const schemaIndexPath = path.join(
        branchDir,
        "apps/server/src/db/schema/index.ts",
      );

      // Read the file content to check if it's empty
      let fileContent = "";
      let fileExists = false;
      try {
        fileContent = await fs.readFile(schemaIndexPath, "utf-8");
        fileExists = true;
      } catch {
        // File doesn't exist, that's ok
      }

      // If file exists and is empty (or only whitespace), add dummy table
      if (fileExists && fileContent.trim() === "") {
        const dummyTableContent = `import { pgTable, serial, varchar } from "drizzle-orm/pg-core";

// Dummy table - delete this when you add your actual schema
export const dummyTable = pgTable("dummy_table", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
});`;

        try {
          await fs.writeFile(schemaIndexPath, dummyTableContent, "utf-8");
        } catch (error) {
          Logger.warn("Failed to add dummy table to empty schema index", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Generate schema
      const generateSchemaResult = await runCommand(
        "bun",
        [
          "x",
          "@better-auth/cli@latest",
          "generate",
          "--config",
          "src/lib/auth.ts",
          "--output",
          "src/db/schema/auth.ts",
          "--y",
        ],
        {
          cwd: path.join(branchDir, "apps", "server"),
        },
      );

      if (!generateSchemaResult.success) {
        throw new Error(
          `Failed to generate schema for Better-Auth: ${generateSchemaResult.stderr}`,
        );
      }

      // If we added dummy table (file was empty), clear it before appending auth export
      if (fileExists && fileContent.trim() === "") {
        // Clear the file and add only the auth export
        try {
          await fs.writeFile(
            schemaIndexPath,
            'export * from "./auth";\n',
            "utf-8",
          );
        } catch (error) {
          throw new Error(
            `Failed to write auth export to schema index: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      } else {
        // File wasn't empty, just append the auth export
        try {
          await fs.appendFile(
            schemaIndexPath,
            '\nexport * from "./auth";\n',
            "utf-8",
          );
        } catch (error) {
          throw new Error(
            `Failed to append auth export to schema index: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      return {
        success: true,
        message: "Successfully generated schema for Better-Auth",
      };
    } catch (error) {
      Logger.error(
        `Failed to run post-install hook while setting up Better-Auth: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        success: false,
        message: "Failed to run post-install hook while setting up Better-Auth",
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  },
});
