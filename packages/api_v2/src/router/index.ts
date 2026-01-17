import * as branches from "./branches";
import * as chats from "./chats";
import * as declarations from "./declarations";
import * as environmentVariables from "./environment-variables";
import health from "./health";
import * as integrationTemplates from "./integration-templates";
import * as integrations from "./integrations";
import * as nodes from "./nodes";
import * as projects from "./projects";
import ready from "./ready";
import * as snapshots from "./snapshots";

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
};
