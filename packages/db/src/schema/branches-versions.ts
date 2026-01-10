import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { nanoid } from "@weldr/shared/nanoid";

import { users } from "./auth";
import { chats } from "./chats";
import { projects } from "./projects";

export const branches = pgTable(
  "branches",
  {
    id: text("id").primaryKey().$defaultFn(nanoid),
    name: text("name").notNull(),
    description: text("description"),
    projectId: text("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    type: text("type").$type<"variant" | "stream">().notNull().default("stream"),
    parentBranchId: text("parent_branch_id").references((): AnyPgColumn => branches.id, {
      onDelete: "set null",
    }),
    forkedFromVersionId: text("forked_from_version_id").references((): AnyPgColumn => versions.id, {
      onDelete: "restrict",
    }),
    forksetId: text("forkset_id"),
    headVersionId: text("head_version_id").references((): AnyPgColumn => versions.id, {
      onDelete: "set null",
    }),
    isMain: boolean("is_main").notNull().default(false),
    status: text("status").$type<"active" | "archived">().notNull().default("active"),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("branches_name_unique").on(t.projectId, t.name),
    index("branches_project_idx").on(t.projectId),
    index("branches_parent_fork_idx").on(t.parentBranchId, t.forkedFromVersionId),
    index("branches_forkset_idx").on(t.forksetId),
    index("branches_head_idx").on(t.headVersionId),
    // one main per project
    uniqueIndex("branches_one_main_per_project_uidx")
      .on(t.projectId)
      .where(sql`${t.isMain} = true`),
    // Main/root branch must NOT have a fork point
    check("branches_main_no_fork_chk", sql`(NOT ${t.isMain} OR ${t.forkedFromVersionId} IS NULL)`),
    // Variants REQUIRE fork point and forkset
    check(
      "branches_variant_requirements_chk",
      sql`(${t.type} <> 'variant' OR (${t.forkedFromVersionId} IS NOT NULL AND ${t.forksetId} IS NOT NULL))`,
    ),
    // Streams must NOT have a forkset
    check("branches_stream_no_forkset_chk", sql`(${t.type} <> 'stream' OR ${t.forksetId} IS NULL)`),
    // Non-main streams that have a parent MUST have a fork point
    check(
      "branches_stream_parent_requires_fork_chk",
      sql`(NOT (${t.type} = 'stream' AND ${t.isMain} = false AND ${t.parentBranchId} IS NOT NULL) OR ${t.forkedFromVersionId} IS NOT NULL)`,
    ),
  ],
);

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
    appliedFromBranchId: text("applied_from_branch_id").references(() => branches.id, {
      onDelete: "set null",
    }),
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
    uniqueIndex("version_sequence_number_unique_idx").on(t.branchId, t.sequenceNumber),
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
