import { relations } from "drizzle-orm";

import { users } from "./auth";
import { branches, versions } from "./branches-versions";
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
import { versionDeclarations } from "./version-declarations";
import { versionSessions } from "./version-sessions";

export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  environmentVariables: many(environmentVariables),
  chats: many(chats),
  chatMessages: many(chatMessages),
}));

export const chatRelations = relations(chats, ({ one, many }) => ({
  messages: many(chatMessages),
  streams: many(streams),
  version: one(versions),
  user: one(users, {
    fields: [chats.userId],
    references: [users.id],
  }),
  project: one(projects, {
    fields: [chats.projectId],
    references: [projects.id],
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
  versions: many(versions),
  integrations: many(integrations),
  branches: many(branches),
}));

export const branchesRelations = relations(branches, ({ one, many }) => ({
  project: one(projects, {
    fields: [branches.projectId],
    references: [projects.id],
  }),
  parent: one(branches, {
    fields: [branches.parentBranchId],
    references: [branches.id],
    relationName: "branch_parent",
  }),
  forkedFromVersion: one(versions, {
    relationName: "branch_forked_from_version",
    fields: [branches.forkedFromVersionId],
    references: [versions.id],
  }),
  headVersion: one(versions, {
    relationName: "branch_head_version",
    fields: [branches.headVersionId],
    references: [versions.id],
  }),
  children: many(branches, { relationName: "branch_parent" }),
  versions: many(versions, { relationName: "version_branch" }),
}));

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
  session: one(versionSessions),
}));

export const versionSessionsRelations = relations(versionSessions, ({ one }) => ({
  version: one(versions, {
    fields: [versionSessions.versionId],
    references: [versions.id],
  }),
}));

export const versionDeclarationsRelations = relations(versionDeclarations, ({ one }) => ({
  declaration: one(declarations, {
    fields: [versionDeclarations.declarationId],
    references: [declarations.id],
  }),
  version: one(versions, {
    fields: [versionDeclarations.versionId],
    references: [versions.id],
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
  versions: many(versionDeclarations),
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
  version: one(versions, {
    fields: [integrationInstallations.versionId],
    references: [versions.id],
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
