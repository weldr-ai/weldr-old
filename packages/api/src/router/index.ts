import attachments from "./attachments";
import branches from "./branches";
import chats from "./chats";
import declarations from "./declarations";
import environmentVariables from "./environment-variables";
import health from "./health";
import integrationTemplates from "./integration-templates";
import integrations from "./integrations";
import nodes from "./nodes";
import projects from "./projects";
import ready from "./ready";
import snapshots from "./snapshots";

export const router = {
  health,
  ready,
  projects,
  chats,
  environmentVariables,
  declarations,
  snapshots,
  integrations,
  integrationTemplates,
  nodes,
  branches,
  attachments,
};
