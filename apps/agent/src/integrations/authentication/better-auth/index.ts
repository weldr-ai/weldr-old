import { randomBytes } from "node:crypto";

import { db } from "@weldr/db";
import { environmentVariables, integrationEnvironmentVariables, secrets } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import type { IntegrationPackageSets } from "@/integrations/types";
import { defineIntegration } from "@/integrations/utils/define-integration";
import { exec } from "@/lib/sandbox/exec";
import { fileExists, readFile, writeFile } from "@/lib/sandbox/fs";

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
    const project = context.project;
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
    const project = context.project;
    const branch = context.branch;
    const user = context.user;

    try {
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

      const schemaIndexPath = "/apps/server/src/db/schema/index.ts";

      const existsResult = fileExists(branch.id, schemaIndexPath);
      let fileContent = "";

      if (existsResult) {
        const readResult = readFile(branch.id, schemaIndexPath);
        if (readResult.success) {
          fileContent = readResult.data || "";
        }
      }

      if (existsResult && fileContent.trim() === "") {
        const dummyTableContent = `import { pgTable, serial, varchar } from "drizzle-orm/pg-core";

// Dummy table - delete this when you add your actual schema
export const dummyTable = pgTable("dummy_table", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
});`;

        writeFile(branch.id, schemaIndexPath, dummyTableContent);
      }

      const generateSchemaResult = exec(
        `bun x @better-auth/cli@latest generate --config src/lib/auth.ts --output src/db/schema/auth.ts --y`,
        {
          projectId: project.id,
          branchId: branch.id,
        },
      );

      if (generateSchemaResult.exitCode !== 0) {
        throw new Error(
          `Failed to generate schema for Better-Auth: ${generateSchemaResult.stderr}`,
        );
      }

      if (existsResult && fileContent.trim() === "") {
        writeFile(branch.id, schemaIndexPath, 'export * from "./auth";\n');
      } else {
        const currentReadResult = readFile(branch.id, schemaIndexPath);
        const currentContent = currentReadResult.success ? currentReadResult.data || "" : "";
        writeFile(branch.id, schemaIndexPath, currentContent + '\nexport * from "./auth";\n');
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
