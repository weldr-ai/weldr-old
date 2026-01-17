import { relations } from "drizzle-orm";

import { users } from "./auth";
import { branches } from "./branches";
import { attachments, chatMessages, chats, streams } from "./chats";
import { declarations } from "./declarations";
import { dependencies } from "./dependencies";
import { environmentVariables } from "./environment-variables";
import { integrationCategories } from "./integration-categories";
import { integrationTemplates } from "./integration-templates";
import {
  integrationEnvironmentVariables,
  integrationInstallations,
  integrations,
} from "./integrations";
import { nodes } from "./nodes";
import { projects } from "./projects";
import { snapshotDeclarations } from "./snapshot-declarations";
import { snapshotParents, snapshots } from "./snapshots";

export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  environmentVariables: many(environmentVariables),
  chats: many(chats),
  chatMessages: many(chatMessages),
}));

export const chatRelations = relations(chats, ({ one, many }) => ({
  messages: many(chatMessages),
  streams: many(streams),
  user: one(users, {
    fields: [chats.userId],
    references: [users.id],
  }),
  project: one(projects, {
    fields: [chats.projectId],
    references: [projects.id],
  }),
  branch: one(branches, {
    fields: [chats.branchId],
    references: [branches.id],
  }),
}));

export const chatMessageRelations = relations(chatMessages, ({ one, many }) => ({
  chat: one(chats, {
    fields: [chatMessages.chatId],
    references: [chats.id],
  }),
  attachments: many(attachments),
  user: one(users, {
    fields: [chatMessages.userId],
    references: [users.id],
  }),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  user: one(users, {
    fields: [attachments.userId],
    references: [users.id],
  }),
  message: one(chatMessages, {
    fields: [attachments.messageId],
    references: [chatMessages.id],
  }),
}));

export const streamRelations = relations(streams, ({ one }) => ({
  chat: one(chats, {
    fields: [streams.chatId],
    references: [chats.id],
  }),
}));

export const projectRelations = relations(projects, ({ many, one }) => ({
  environmentVariables: many(environmentVariables),
  user: one(users, {
    fields: [projects.userId],
    references: [users.id],
  }),
  snapshots: many(snapshots),
  integrations: many(integrations),
  branches: many(branches),
}));

// Snapshot relations
export const snapshotsRelations = relations(snapshots, ({ one, many }) => ({
  project: one(projects, {
    fields: [snapshots.projectId],
    references: [projects.id],
  }),
  creator: one(users, {
    fields: [snapshots.createdBy],
    references: [users.id],
  }),
  // Parents of this snapshot (via junction table)
  parentEdges: many(snapshotParents, { relationName: "child" }),
  // Children of this snapshot (via junction table)
  childEdges: many(snapshotParents, { relationName: "parent" }),
  // Declarations in this snapshot
  declarations: many(snapshotDeclarations),
  // Integration installations for this snapshot
  integrationInstallations: many(integrationInstallations),
}));

export const snapshotParentsRelations = relations(snapshotParents, ({ one }) => ({
  snapshot: one(snapshots, {
    fields: [snapshotParents.snapshotId],
    references: [snapshots.id],
    relationName: "child",
  }),
  parent: one(snapshots, {
    fields: [snapshotParents.parentId],
    references: [snapshots.id],
    relationName: "parent",
  }),
}));

// Branch relations
export const branchesRelations = relations(branches, ({ one, many }) => ({
  project: one(projects, {
    fields: [branches.projectId],
    references: [projects.id],
  }),
  snapshot: one(snapshots, {
    fields: [branches.snapshotId],
    references: [snapshots.id],
  }),
  creator: one(users, {
    fields: [branches.createdBy],
    references: [users.id],
  }),
  chats: many(chats),
}));

// Snapshot declarations relations
export const snapshotDeclarationsRelations = relations(snapshotDeclarations, ({ one }) => ({
  declaration: one(declarations, {
    fields: [snapshotDeclarations.declarationId],
    references: [declarations.id],
  }),
  snapshot: one(snapshots, {
    fields: [snapshotDeclarations.snapshotId],
    references: [snapshots.id],
  }),
}));

export const declarationsRelations = relations(declarations, ({ one, many }) => ({
  node: one(nodes, {
    fields: [declarations.nodeId],
    references: [nodes.id],
  }),
  previous: many(declarations),
  project: one(projects, {
    fields: [declarations.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [declarations.userId],
    references: [users.id],
  }),
  dependencies: many(dependencies, {
    relationName: "dependency_declaration",
  }),
  dependents: many(dependencies, {
    relationName: "dependent_declaration",
  }),
  snapshots: many(snapshotDeclarations),
}));

export const dependenciesRelations = relations(dependencies, ({ one }) => ({
  dependency: one(declarations, {
    relationName: "dependency_declaration",
    fields: [dependencies.dependencyId],
    references: [declarations.id],
  }),
  dependent: one(declarations, {
    relationName: "dependent_declaration",
    fields: [dependencies.dependentId],
    references: [declarations.id],
  }),
}));

export const nodeRelations = relations(nodes, ({ one }) => ({
  declaration: one(declarations),
  project: one(projects, {
    fields: [nodes.projectId],
    references: [projects.id],
  }),
}));

export const integrationCategoriesRelations = relations(integrationCategories, ({ many }) => ({
  integrationTemplates: many(integrationTemplates),
}));

export const integrationTemplatesRelations = relations(integrationTemplates, ({ one, many }) => ({
  category: one(integrationCategories, {
    fields: [integrationTemplates.categoryId],
    references: [integrationCategories.id],
  }),
  integrations: many(integrations),
}));

export const integrationsRelations = relations(integrations, ({ one, many }) => ({
  project: one(projects, {
    fields: [integrations.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [integrations.userId],
    references: [users.id],
  }),
  integrationTemplate: one(integrationTemplates, {
    fields: [integrations.integrationTemplateId],
    references: [integrationTemplates.id],
  }),
  environmentVariableMappings: many(integrationEnvironmentVariables),
  declarations: many(declarations),
  installations: many(integrationInstallations),
}));

export const integrationEnvironmentVariablesRelations = relations(
  integrationEnvironmentVariables,
  ({ one }) => ({
    integration: one(integrations, {
      fields: [integrationEnvironmentVariables.integrationId],
      references: [integrations.id],
    }),
    environmentVariable: one(environmentVariables, {
      fields: [integrationEnvironmentVariables.environmentVariableId],
      references: [environmentVariables.id],
    }),
  }),
);

export const integrationInstallationsRelations = relations(integrationInstallations, ({ one }) => ({
  integration: one(integrations, {
    fields: [integrationInstallations.integrationId],
    references: [integrations.id],
  }),
  snapshot: one(snapshots, {
    fields: [integrationInstallations.snapshotId],
    references: [snapshots.id],
  }),
}));

export const environmentVariablesRelations = relations(environmentVariables, ({ one, many }) => ({
  project: one(projects, {
    fields: [environmentVariables.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [environmentVariables.userId],
    references: [users.id],
  }),
  integrations: many(integrationEnvironmentVariables),
}));
