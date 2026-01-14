import os from "node:os";
import path from "node:path";

import { AgentFS } from "agentfs-sdk";
import { createActor } from "xstate";

import { and, db, eq, inArray } from "@weldr/db";
import { projects, users, versions } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import { getInstalledCategories } from "@/core/integrations/utils/get-installed-categories";
import { createAgentFSStorage } from "@/core/persistence";
import { createSessionInput } from "./context";
import { sessionMachine } from "./machine";

/**
 * Recover in-progress sessions on startup.
 * Queries the database for versions that need processing and restarts them.
 * If a snapshot exists, it restores from the snapshot.
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
        // Open AgentFS SQLite database
        const dbPath = path.join(os.homedir(), ".weldr", "db", `${version.branch.id}.db`);
        const agent = await AgentFS.open({ path: dbPath });

        // Create storage interface
        const storage = createAgentFSStorage(agent, version.id);

        // Load workflow state from SQLite
        const snapshot = await storage.loadSessionState(version.id);

        const sessionInput = createSessionInput({
          project: {
            ...project,
            integrationCategories: new Set(installedCategories),
          },
          branch: { ...version.branch, headVersion: version },
          user,
        });

        if (snapshot) {
          Logger.info(`Restoring session from snapshot for version ${version.id}`, {
            extra: {
              previousState: snapshot.state,
              pauseReason: snapshot.pauseReason,
              previousIterations: snapshot.iterationCount,
            },
          });

          const sessionActor = createActor(sessionMachine, {
            input: {
              ...sessionInput,
              storage,
              restoredSnapshot: snapshot,
            },
          });

          sessionActor.start();
          sessionActor.send({ type: "START" });

          Logger.info(`Recovered session from snapshot for version ${version.id}`, {
            extra: {
              restoredIterations: snapshot.iterationCount,
            },
          });
        } else {
          const sessionActor = createActor(sessionMachine, {
            input: {
              ...sessionInput,
              storage,
            },
          });
          sessionActor.start();
          sessionActor.send({ type: "START" });

          Logger.info(`Recovered session (fresh start) for version ${version.id}`);
        }
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
