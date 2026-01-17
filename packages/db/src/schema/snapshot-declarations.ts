import { pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import { declarations } from "./declarations";
import { snapshots } from "./snapshots";

/**
 * Junction table linking snapshots to declarations
 * Tracks which declarations exist in each snapshot
 */
export const snapshotDeclarations = pgTable(
  "snapshot_declarations",
  {
    snapshotId: text("snapshot_id")
      .references(() => snapshots.id, { onDelete: "cascade" })
      .notNull(),
    declarationId: text("declaration_id")
      .references(() => declarations.id, { onDelete: "cascade" })
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.snapshotId, table.declarationId] })],
);
