import { pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import { declarations } from "./declarations";

export const dependencies = pgTable(
  "dependencies",
  {
    dependentId: text("dependent_id")
      .references(() => declarations.id, { onDelete: "cascade" })
      .notNull(),
    dependencyId: text("dependency_id")
      .references(() => declarations.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.dependentId, t.dependencyId],
    }),
  ],
);
