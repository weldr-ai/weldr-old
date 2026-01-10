import { index, jsonb, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import { nanoid } from "@weldr/shared/nanoid";
import type { Task } from "@weldr/shared/types";

import { versions } from "./versions";

export const tasks = pgTable("tasks", {
  id: text("id").primaryKey().$defaultFn(nanoid),
  status: text("status")
    .$type<"pending" | "in_progress" | "completed" | "failed">()
    .notNull()
    .default("pending"),
  data: jsonb("data").$type<Task>().notNull(),
  versionId: text("version_id")
    .references(() => versions.id, { onDelete: "cascade" })
    .notNull(),
});

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    dependentId: text("dependent_id")
      .references(() => tasks.id, { onDelete: "cascade" })
      .notNull(),
    dependencyId: text("dependency_id")
      .references(() => tasks.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.dependentId, t.dependencyId] }),
    index("task_dependencies_dependent_id_idx").on(t.dependentId),
    index("task_dependencies_dependency_id_idx").on(t.dependencyId),
  ],
);
