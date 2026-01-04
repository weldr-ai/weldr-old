import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { nanoid } from "@weldr/shared/nanoid";

import { users } from "./auth";
import { branches } from "./branches";
import { chats } from "./chats";
import { declarations } from "./declarations";
import { integrationInstallations } from "./integrations";
import { projects } from "./projects";
import { tasks } from "./tasks";

export const versions = pgTable(
  "versions",
  {
    id: text("id").primaryKey().$defaultFn(nanoid),

    projectId: text("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    chatId: text("chat_id")
      .references(() => chats.id, { onDelete: "cascade" })
      .notNull(),
    branchId: text("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    parentVersionId: text("parent_version_id").references(
      (() => versions.id) as unknown as () => AnyPgColumn,
      { onDelete: "set null" },
    ),
    snapshotPath: text("snapshot_path"),
    kind: text("kind")
      .$type<"checkpoint" | "integration" | "revert">()
      .notNull()
      .default("checkpoint"),
    commitHash: text("commit_hash"),
    number: integer("number").notNull(),
    sequenceNumber: integer("sequence_number").notNull(),
    message: text("message"),
    description: text("description"),
    status: text("status")
      .$type<"planning" | "coding" | "finalizing" | "completed" | "failed">()
      .default("planning")
      .notNull(),
    acceptanceCriteria: jsonb("acceptance_criteria").$type<string[]>(),
    changedFiles: jsonb("changed_files")
      .$type<{ path: string; type: "added" | "modified" | "deleted" }[]>()
      .default([])
      .notNull(),
    appliedFromBranchId: text("applied_from_branch_id").references(
      () => branches.id,
      {
        onDelete: "set null",
      },
    ),
    revertedVersionId: text("reverted_version_id").references(
      (() => versions.id) as unknown as () => AnyPgColumn,
      { onDelete: "set null" },
    ),
    publishedAt: timestamp("published_at").defaultNow(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("version_number_unique_idx").on(t.projectId, t.number),
    uniqueIndex("version_sequence_number_unique_idx").on(
      t.branchId,
      t.sequenceNumber,
    ),
    index("versions_created_at_idx").on(t.createdAt),
    index("versions_chat_id_idx").on(t.chatId),
    index("versions_branch_created_idx").on(t.branchId, t.createdAt),
    uniqueIndex("versions_commit_hash_uidx")
      .on(t.commitHash)
      .where(sql`commit_hash IS NOT NULL`),

    // If kind='revert' then revertedVersionId must be set; otherwise it must be NULL
    check(
      "versions_revert_link_chk",
      sql`((${t.kind} <> 'revert') OR ${t.revertedVersionId} IS NOT NULL)
             AND ((${t.kind} = 'revert') OR ${t.revertedVersionId} IS NULL)`,
    ),
    // If kind='integration' then appliedFromBranchId must be set; otherwise it must be NULL
    check(
      "versions_integration_link_chk",
      sql`((${t.kind} <> 'integration') OR ${t.appliedFromBranchId} IS NOT NULL)
             AND ((${t.kind} = 'integration') OR ${t.appliedFromBranchId} IS NULL)`,
    ),
  ],
);

export const versionsRelations = relations(versions, ({ one, many }) => ({
  parent: one(versions, {
    fields: [versions.parentVersionId],
    references: [versions.id],
    relationName: "version_parent",
  }),
  branch: one(branches, {
    relationName: "version_branch",
    fields: [versions.branchId],
    references: [branches.id],
  }),
  appliedFromBranch: one(branches, {
    relationName: "version_applied_from_branch",
    fields: [versions.appliedFromBranchId],
    references: [branches.id],
  }),
  revertedVersion: one(versions, {
    relationName: "version_reverted_version",
    fields: [versions.revertedVersionId],
    references: [versions.id],
  }),
  tasks: many(tasks),
  children: many(versions, {
    relationName: "version_children",
  }),
  chat: one(chats, {
    fields: [versions.chatId],
    references: [chats.id],
  }),
  project: one(projects, {
    fields: [versions.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [versions.userId],
    references: [users.id],
  }),
  declarations: many(versionDeclarations),
  integrationInstallations: many(integrationInstallations),
}));

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

export const versionDeclarationsRelations = relations(
  versionDeclarations,
  ({ one }) => ({
    declaration: one(declarations, {
      fields: [versionDeclarations.declarationId],
      references: [declarations.id],
    }),
    version: one(versions, {
      fields: [versionDeclarations.versionId],
      references: [versions.id],
    }),
  }),
);
