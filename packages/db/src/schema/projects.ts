import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { nanoid } from "@weldr/shared/nanoid";

import { users } from "./auth";

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey().$defaultFn(nanoid),
    title: text("title"),
    description: text("description"),
    subdomain: text("subdomain").unique().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => [index("projects_created_at_idx").on(t.createdAt)],
);
