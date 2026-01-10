import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { nanoid } from "@weldr/shared/nanoid";
import type { IntegrationCategoryKey, IntegrationKey } from "@weldr/shared/types";

export const integrationCategories = pgTable(
  "integration_categories",
  {
    id: text("id").primaryKey().$defaultFn(nanoid),
    key: text("key").$type<IntegrationCategoryKey>().notNull(),
    description: text("description").notNull(),
    recommendedIntegrations: jsonb("recommended_integrations").$type<IntegrationKey[]>().notNull(),
    dependencies: jsonb("dependencies").$type<IntegrationCategoryKey[]>(),
    priority: integer("priority").notNull().default(100),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("integration_categories_created_at_idx").on(t.createdAt),
    uniqueIndex("integration_categories_key_idx").on(t.key),
  ],
);
