import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { nanoid } from "@weldr/shared/nanoid";

import { users } from "./auth";
import { projects } from "./projects";
import { snapshots } from "./snapshots";

/**
 * Branches: Named mutable references to snapshots (like git branches)
 * The source of truth for "what is current"
 */
export const branches = pgTable(
  "branches",
  {
    id: text("id").primaryKey().$defaultFn(nanoid),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Name - human-readable identifier (e.g., "main", "auth", "search")
    name: text("name").notNull(),

    // Current snapshot this branch points to
    snapshotId: text("snapshot_id").references(() => snapshots.id, { onDelete: "set null" }),

    // Audit
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    // Branch names must be unique within a project
    unique("branches_project_name_unique").on(t.projectId, t.name),
    index("branches_project_idx").on(t.projectId),
    index("branches_snapshot_idx").on(t.snapshotId),
  ],
);
