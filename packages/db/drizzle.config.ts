import type { Config } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL ?? "";

export default {
  schema: [
    "./src/schema/ai-models.ts",
    "./src/schema/auth.ts",
    "./src/schema/branches.ts",
    "./src/schema/chats.ts",
    "./src/schema/declaration-templates.ts",
    "./src/schema/declarations.ts",
    "./src/schema/dependencies.ts",
    "./src/schema/environment-variables.ts",
    "./src/schema/integration-categories.ts",
    "./src/schema/integration-templates.ts",
    "./src/schema/integrations.ts",
    "./src/schema/nodes.ts",
    "./src/schema/presets.ts",
    "./src/schema/projects.ts",
    "./src/schema/tasks.ts",
    "./src/schema/themes.ts",
    "./src/schema/version-declarations.ts",
    "./src/schema/versions.ts",
  ],
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: { url: connectionString },
} satisfies Config;
