import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { nanoid } from "@weldr/shared/nanoid";

import { users } from "./auth";
import { projects } from "./projects";
import { secrets } from "./vault";

export const environmentVariables = pgTable(
  "environment_variables",
  {
    id: text("id").primaryKey().$defaultFn(nanoid),
    key: text("key").notNull(),
    secretId: uuid("secret_id")
      .references(() => secrets.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    projectId: text("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => [unique("unique_key").on(t.projectId, t.key)],
);
