import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { nanoid } from "@weldr/shared/nanoid";
import type {
  IntegrationKey,
  IntegrationTemplateOptions,
  IntegrationTemplateRecommendedOptions,
  IntegrationTemplateVariable,
} from "@weldr/shared/types";

import { integrationCategories } from "./integration-categories";

export const integrationTemplates = pgTable(
  "integration_templates",
  {
    id: text("id").primaryKey().$defaultFn(nanoid),
    name: text("name").notNull(),
    description: text("description").notNull(),
    key: text("key").$type<IntegrationKey>().notNull(),
    version: text("version").notNull(),
    variables: jsonb("variables").$type<IntegrationTemplateVariable>(),
    options: jsonb("options").$type<IntegrationTemplateOptions>(),
    recommendedOptions: jsonb("recommended_options").$type<IntegrationTemplateRecommendedOptions>(),
    isRecommended: boolean("is_recommended").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    categoryId: text("category_id")
      .references(() => integrationCategories.id)
      .notNull(),
  },
  (t) => [
    index("integration_templates_created_at_idx").on(t.createdAt),
    index("integration_templates_category_id_idx").on(t.categoryId),
    uniqueIndex("integration_templates_key_version_idx").on(t.key, t.version),
  ],
);
