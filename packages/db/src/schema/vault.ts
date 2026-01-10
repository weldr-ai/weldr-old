import { sql } from "drizzle-orm";
import { customType, pgSchema, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const vault = pgSchema("vault");

const bytea = customType<{ data: string; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
});

export const secrets = vault.table(
  "secrets",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    name: text("name"),
    description: text("description").default("").notNull(),
    secret: text("secret").notNull(),
    keyId: uuid("key_id").default(sql`(pgsodium.create_key()).id`),
    nonce: bytea("nonce"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("secrets_name_idx").on(table.name)],
);
