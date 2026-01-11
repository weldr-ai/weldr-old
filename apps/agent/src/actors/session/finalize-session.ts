import { fromPromise } from "xstate";

import { db, eq } from "@weldr/db";
import { versions } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";
import { getBranchDir, isCloudMode } from "@weldr/shared/state";

import { extractDeclarationsFromProject } from "@/ai/utils/extract-changed-files";
import { syncBranchToStorage } from "@/lib/branch-state";
import { build } from "@/lib/build";
import { Git } from "@/lib/git";
import { agentFSManager, createSnapshotService, syncAgentFSToDisk } from "@/lib/storage";
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

    const branchDir = getBranchDir(project.id, branch.id);

    logger.info("Syncing AgentFS to disk");
    const agent = await agentFSManager.acquire(project.id, branch.id, branchDir);
    let synced: number;
    let errors: string[];
    try {
      const result = await syncAgentFSToDisk(agent, branchDir);
      synced = result.synced;
      errors = result.errors;
    } finally {
      await agentFSManager.release(project.id, branch.id);
    }

    logger.info("AgentFS synced to disk", {
      extra: { synced, errorCount: errors.length },
    });

    // Get changed files from git BEFORE committing (uncommitted changes)
    logger.info("Getting changed files from git");
    const changedFiles = await Git.getChangedFiles(branchDir);

    logger.info("Changed files detected", {
      extra: {
        count: changedFiles.length,
        added: changedFiles.filter((f) => f.type === "added").length,
        modified: changedFiles.filter((f) => f.type === "modified").length,
        deleted: changedFiles.filter((f) => f.type === "deleted").length,
      },
    });

    logger.info("Creating git commit");

    const commitMessage = branch.headVersion.message
      ? `${branch.headVersion.message}${branch.headVersion.description ? `\n\n${branch.headVersion.description}` : ""}`
      : `Version #${branch.headVersion.sequenceNumber}`;

    let commitHash: string | null = null;
    try {
      commitHash = await Git.commit(
        commitMessage,
        {
          name: user?.name ?? "Weldr",
          email: user?.email ?? "agent@weldr.dev",
        },
        branchDir,
      );
      logger.info("Git commit created", { extra: { commitHash } });
    } catch (error) {
      logger.warn("Failed to create git commit (may have no changes)", {
        extra: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
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
        })
        .catch((error) => {
          logger.error("Declaration extraction failed", {
            extra: { error: error instanceof Error ? error.message : String(error) },
          });
        });
    }

    logger.info("Syncing branch to storage");
    await syncBranchToStorage(branch.id, project.id);

    logger.info("Creating AgentFS snapshot");

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
