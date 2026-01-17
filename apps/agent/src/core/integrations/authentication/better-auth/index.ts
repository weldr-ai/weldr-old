import { randomBytes } from "node:crypto";

import { db } from "@weldr/db";
import { environmentVariables, integrationEnvironmentVariables, secrets } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import { exec } from "@/core/workspace/exec";
import { getOrCreateWorkspace } from "@/core/workspace/just-bash/session";
import type { IntegrationPackageSets } from "../../types";
import { defineIntegration } from "../../utils/define-integration";

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
    const snapshotId = branch.snapshot?.id;

    if (!snapshotId) {
      return {
        success: false,
        message: "Cannot run post-install: branch has no snapshot",
        errors: ["Branch has no snapshot"],
      };
    }

    try {
      const session = await getOrCreateWorkspace({
        projectId: project.id,
        snapshotId,
      });

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

      let fileExists = false;
      try {
        const stat = await session.agent.fs.stat(schemaIndexPath);
        fileExists = stat.isFile();
      } catch {
        fileExists = false;
      }

      let fileContent = "";

      if (fileExists) {
        try {
          fileContent = await session.agent.fs.readFile(schemaIndexPath, "utf-8");
        } catch (error) {
          throw new Error(`Failed to read schema index file`, {
            cause: error,
          });
        }
      }

      if (fileExists && fileContent.trim() === "") {
        const dummyTableContent = `import { pgTable, serial, varchar } from "drizzle-orm/pg-core";

// Dummy table - delete this when you add your actual schema
export const dummyTable = pgTable("dummy_table", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
});`;

        try {
          await session.agent.fs.writeFile(schemaIndexPath, dummyTableContent);
        } catch (error) {
          throw new Error(`Failed to write dummy schema`, {
            cause: error,
          });
        }
      }

      const generateSchemaResult = await exec(
        `bun x @better-auth/cli@latest generate --config src/lib/auth.ts --output src/db/schema/auth.ts --y`,
        {
          projectId: project.id,
          snapshotId,
        },
      );

      if (generateSchemaResult.exitCode !== 0) {
        throw new Error(
          `Failed to generate schema for Better-Auth: ${generateSchemaResult.stderr}`,
        );
      }

      if (fileExists && fileContent.trim() === "") {
        try {
          await session.agent.fs.writeFile(schemaIndexPath, 'export * from "./auth";\n');
        } catch (error) {
          throw new Error(`Failed to update schema index`, {
            cause: error,
          });
        }
      } else {
        let currentContent = "";
        try {
          currentContent = await session.agent.fs.readFile(schemaIndexPath, "utf-8");
        } catch (error) {
          throw new Error(`Failed to read schema index file`, {
            cause: error,
          });
        }
        try {
          await session.agent.fs.writeFile(
            schemaIndexPath,
            currentContent + '\nexport * from "./auth";\n',
          );
        } catch (error) {
          throw new Error(`Failed to update schema index`, {
            cause: error,
          });
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
