import { pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import { declarations } from "./declarations";
import { versions } from "./versions";

export const versionDeclarations = pgTable(
  "version_declarations",
  {
    versionId: text("version_id")
      .references(() => versions.id, { onDelete: "cascade" })
      .notNull(),
    declarationId: text("declaration_id")
      .references(() => declarations.id, { onDelete: "cascade" })
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.versionId, table.declarationId] })],
);
