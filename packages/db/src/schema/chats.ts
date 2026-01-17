import { index, integer, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { nanoid } from "@weldr/shared/nanoid";
import type { AiMessageMetadata, ChatMessageContent } from "@weldr/shared/types";

import { users } from "./auth";
import { branches } from "./branches";
import { projects } from "./projects";

export const messageRoles = pgEnum("message_roles", ["user", "assistant", "tool"]);

export const messageVisibility = pgEnum("message_visibility", ["public", "internal"]);

export const chats = pgTable(
  "chats",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    projectId: text("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    // Branch this chat works on
    branchId: text("branch_id").references(() => branches.id, { onDelete: "set null" }),
  },
  (t) => [index("chats_created_at_idx").on(t.createdAt), index("chats_branch_idx").on(t.branchId)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    role: messageRoles("role").notNull().default("assistant"),
    content: jsonb("content").$type<ChatMessageContent>().notNull(),
    metadata: jsonb("metadata").$type<AiMessageMetadata>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    chatId: text("chat_id")
      .references(() => chats.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [index("chat_messages_created_at_idx").on(t.createdAt)],
);

export const attachments = pgTable(
  "attachments",
  {
    id: text("id").primaryKey().$defaultFn(nanoid),
    name: text("name").notNull(),
    key: text("key").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    messageId: text("message_id")
      .references(() => chatMessages.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => [index("attachments_created_at_idx").on(t.createdAt)],
);

export const streams = pgTable(
  "streams",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    chatId: text("chat_id")
      .references(() => chats.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("streams_chat_id_idx").on(t.chatId)],
);
