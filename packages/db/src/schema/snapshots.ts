import {
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { nanoid } from "@weldr/shared/nanoid";

import { users } from "./auth";
import { projects } from "./projects";

/**
 * Snapshots: Immutable points in time (like git commits)
 * Forms a DAG via parent relationships in snapshotParents table
 */
export const snapshots = pgTable(
  "snapshots",
  {
    id: text("id").primaryKey().$defaultFn(nanoid),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // State reference
    commitSha: text("commit_sha"),

    // Metadata
    title: text("title"),
    description: text("description"),

    // Metrics (aggregated from the work that created this snapshot)
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    totalCost: doublePrecision("total_cost").default(0).notNull(),

    // Audit
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("snapshots_project_idx").on(t.projectId),
    index("snapshots_created_at_idx").on(t.createdAt),
    index("snapshots_commit_sha_idx").on(t.commitSha),
  ],
);

/**
 * DAG edges for snapshots - enables merge (multiple parents)
 */
export const snapshotParents = pgTable(
  "snapshot_parents",
  {
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => snapshots.id, { onDelete: "cascade" }),
    parentId: text("parent_id")
      .notNull()
      .references(() => snapshots.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({ columns: [table.snapshotId, table.parentId] }),
    index("snapshot_parents_parent_idx").on(table.parentId),
  ],
);
