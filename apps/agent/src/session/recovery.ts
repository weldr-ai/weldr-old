import { createActor } from "xstate";

import { and, db, eq, inArray } from "@weldr/db";
import { projects, users, versions } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import { getInstalledCategories } from "@/integrations/utils/get-installed-categories";
import { sessionMachine } from "@/machines";
import { createSessionInput } from "./context";

/**
 * Recover in-progress sessions on startup.
 * Queries the database for versions that need processing and restarts them.
 */
export async function recoverSessions(): Promise<void> {
  Logger.info("Recovering sessions");

  try {
    const projectId = process.env.PROJECT_ID;
    if (!projectId) {
      Logger.info("No PROJECT_ID set, skipping session recovery");
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

    const versionsList = await db.query.versions.findMany({
      where: and(
        eq(versions.projectId, project.id),
        inArray(versions.status, ["planning", "coding", "finalizing"]),
      ),
      with: {
        branch: true,
      },
    });

    if (versionsList.length === 0) {
      Logger.info("No in-progress sessions to recover");
      return;
    }

    Logger.info(`Found ${versionsList.length} sessions to recover`);

    for (const version of versionsList) {
      try {
        const sessionInput = createSessionInput({
          project: {
            ...project,
            integrationCategories: new Set(installedCategories),
          },
          branch: { ...version.branch, headVersion: version },
          user,
        });

        const sessionActor = createActor(sessionMachine, { input: sessionInput });
        sessionActor.start();
        sessionActor.send({ type: "START" });

        Logger.info(`Recovered session for version ${version.id}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error("Failed to recover session", {
          extra: { versionId: version.id, error: errorMessage },
        });
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Logger.error("Session recovery failed", {
      extra: { error: errorMessage },
    });
  }
}
