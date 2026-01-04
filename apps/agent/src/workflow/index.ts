import { and, db, eq, inArray } from "@weldr/db";
import { projects, users, versions } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import { getInstalledCategories } from "@/integrations/utils/get-installed-categories";
import { WorkflowContext } from "./context";
import { createWorkflow } from "./engine";
import {
  codingStep,
  finalizingStep,
  generateBranchNameStep,
  generateProjectInfoStep,
  generateVersionDetailsStep,
  planningStep,
} from "./steps";

export const workflow = createWorkflow({
  retryConfig: {
    attempts: 3,
    delay: 1000,
  },
})
  .step(planningStep, {
    condition: (context) => {
      const status = context.get("branch").headVersion.status;
      return status === "planning";
    },
  })
  .step(generateProjectInfoStep, {
    condition: (context) => {
      const project = context.get("project");
      const status = context.get("branch").headVersion.status;
      return status === "coding" && (!project.title || !project.description);
    },
  })
  .step(generateBranchNameStep, {
    condition: (context) => {
      const branch = context.get("branch");
      const hasPlaceholderName =
        branch.name?.startsWith("variant/") ||
        branch.name?.startsWith("stream/");
      return hasPlaceholderName;
    },
  })
  .step(generateVersionDetailsStep, {
    condition: (context) => {
      const branch = context.get("branch");
      const status = branch.headVersion.status;
      return (
        status === "coding" &&
        (!branch.headVersion.message || !branch.headVersion.description)
      );
    },
  })
  .step(codingStep, {
    condition: (context) => {
      const status = context.get("branch").headVersion.status;
      return status === "coding";
    },
  })
  .step(finalizingStep, {
    condition: (context) => {
      const status = context.get("branch").headVersion.status;
      return status === "finalizing";
    },
  });

/**
 * Recover in-progress workflows on startup.
 * Queries the database for versions that need processing.
 */
export async function recoverWorkflow() {
  Logger.info("Recovering workflow");

  // Get project ID from environment (set for both local and cloud)
  const projectId = process.env.PROJECT_ID;

  if (!projectId) {
    Logger.info("No PROJECT_ID set, skipping workflow recovery");
    return;
  }

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with: {
      integrations: {
        with: {
          integrationTemplate: {
            with: {
              category: true,
            },
          },
        },
      },
    },
  });

  if (!project) {
    Logger.warn(`Project not found: ${projectId}`);
    return;
  }

  const installedCategories = await getInstalledCategories(project.id);

  const user = await db.query.users.findFirst({
    where: eq(users.id, project.userId),
  });

  if (!user) {
    Logger.warn(`User not found for project ${project.id}`);
    return;
  }

  // Find versions that are in progress
  const versionsList = await db.query.versions.findMany({
    where: and(
      eq(versions.projectId, project.id),
      inArray(versions.status, ["coding", "finalizing"]),
    ),
    with: {
      branch: true,
    },
  });

  if (versionsList.length === 0) {
    Logger.info("No in-progress versions to recover");
    return;
  }

  Logger.info(`Found ${versionsList.length} versions to recover`);

  for (const version of versionsList) {
    const context = new WorkflowContext();
    context.set("project", {
      ...project,
      integrationCategories: new Set(installedCategories),
    });
    context.set("branch", { ...version.branch, headVersion: version });
    context.set("user", user);
    await workflow.execute({ context });
    Logger.info(`Recovered workflow for version ${version.id}`);
  }
}
