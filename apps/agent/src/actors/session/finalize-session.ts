import { fromPromise } from "xstate";

import { db, eq } from "@weldr/db";
import { versions } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import { extractDeclarationsFromProject } from "@/ai/utils/extract-changed-files";
import { build } from "@/lib/build";
import { Git } from "@/lib/git";
import { isCloudMode } from "@/lib/mode";
import { createSnapshotService, syncToCloud } from "@/lib/sandbox";
import { stream } from "@/lib/stream-utils";
import type { SessionMachineContext } from "@/machines/types";

type FinalizeResult = {
  commitHash: string | null;
  snapshotPath: string | null;
};

export const finalizeSessionActor = fromPromise<FinalizeResult, { context: SessionMachineContext }>(
  async ({ input }) => {
    const { project, branch, user } = input.context;

    const logger = Logger.get({
      projectId: project.id,
      branchId: branch.id,
      versionId: branch.headVersion.id,
      actor: "session-machine",
    });

    logger.info("Starting finalization");

    // Get changed files using Git library
    logger.info("Getting changed files from git");
    const changedFiles = await Git.getChangedFiles(project.id, branch.id);

    logger.info("Changed files detected", {
      extra: {
        count: changedFiles.length,
        added: changedFiles.filter((f) => f.type === "added").length,
        modified: changedFiles.filter((f) => f.type === "modified").length,
        deleted: changedFiles.filter((f) => f.type === "deleted").length,
      },
    });

    // Create git commit using Git library (handles sync/cleanup automatically)
    let commitHash: string | null = null;

    if (changedFiles.length > 0) {
      logger.info("Creating git commit");

      const commitMessage = branch.headVersion.message
        ? `${branch.headVersion.message}${branch.headVersion.description ? `\n\n${branch.headVersion.description}` : ""}`
        : `Version #${branch.headVersion.sequenceNumber}`;

      const author = {
        name: user?.name ?? "Weldr",
        email: user?.email ?? "agent@weldr.dev",
      };

      try {
        commitHash = await Git.commit(commitMessage, author, project.id, branch.id);
        logger.info("Git commit created", { extra: { commitHash } });
      } catch (error) {
        logger.warn("Failed to create git commit", {
          extra: { error: error instanceof Error ? error.message : String(error) },
        });
      }
    } else {
      logger.info("No changes to commit");
    }

    // Extract declarations from changed files (fire and forget - non-blocking)
    if (changedFiles.length > 0) {
      logger.info("Starting background declaration extraction");

      extractDeclarationsFromProject({
        context: input.context,
        changedFiles,
      })
        .then((result) => {
          logger.info("Declaration extraction completed", {
            extra: {
              processed: result.processed,
              errors: result.errors.length,
            },
          });
          return result;
        })
        .catch((error) => {
          logger.error("Declaration extraction failed", {
            extra: { error: error instanceof Error ? error.message : String(error) },
          });
        });
    }

    logger.info("Syncing sandbox to cloud storage");
    await syncToCloud(branch.id, project.id);

    logger.info("Creating sandbox snapshot");

    const snapshotService = createSnapshotService(project.id);
    const snapshotPath = await snapshotService.createSnapshot(branch.id, branch.headVersion.id);

    logger.info("Snapshot created", { extra: { snapshotPath } });

    if (isCloudMode()) {
      logger.info("Building version artifact", {
        extra: { versionId: branch.headVersion.id },
      });

      const buildResult = await build({
        projectId: project.id,
        branchId: branch.id,
        versionId: branch.headVersion.id,
      });

      if (buildResult.success) {
        logger.info("Version artifact built successfully", {
          extra: { versionId: branch.headVersion.id },
        });
      } else {
        logger.warn("Failed to build version artifact (non-critical)", {
          extra: { versionId: branch.headVersion.id },
        });
      }
    }

    await db
      .update(versions)
      .set({
        status: "completed",
        commitHash,
        snapshotPath,
      })
      .where(eq(versions.id, branch.headVersion.id));

    logger.info("Version marked as completed");

    const updatedVersion = {
      ...branch.headVersion,
      status: "completed" as const,
      commitHash,
      snapshotPath,
    };

    await stream(branch.headVersion.chatId, {
      type: "update_branch",
      data: {
        ...branch,
        headVersion: updatedVersion,
      },
    });

    logger.info("Finalization completed successfully");

    return { commitHash, snapshotPath };
  },
);
