import { createTRPCRouter } from "../init";
import { branchRouter } from "./branches";
import { chatsRouter } from "./chats";
import { declarationsRouter } from "./declarations";
import { environmentVariablesRouter } from "./environment-variables";
import { integrationTemplatesRouter } from "./integration-templates";
import { integrationsRouter } from "./integrations";
import { nodesRouter } from "./nodes";
import { projectsRouter } from "./projects";
import { snapshotsRouter } from "./snapshots";
import { themesRouter } from "./themes";

export const appRouter = createTRPCRouter({
  projects: projectsRouter,
  chats: chatsRouter,
  environmentVariables: environmentVariablesRouter,
  declarations: declarationsRouter,
  snapshots: snapshotsRouter,
  integrations: integrationsRouter,
  integrationTemplates: integrationTemplatesRouter,
  themes: themesRouter,
  nodes: nodesRouter,
  branches: branchRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
