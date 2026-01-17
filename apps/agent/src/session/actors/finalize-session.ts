import { fromPromise } from "xstate";

import { db, eq } from "@weldr/db";
import { snapshots } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import { build } from "@/core/build";
import { Git } from "@/core/git";
import { persistSessionMetrics } from "@/core/metrics";
import { extractDeclarationsFromProject } from "@/core/project/declarations";
import { syncToCloud } from "@/core/sandbox";
import { stream } from "@/core/stream";
import { isCloudMode } from "@/core/utils";
import type { SessionMachineContext } from "@/session/types";

type FinalizeResult = {
  commitHash: string | null;
};

export const finalizeSessionActor = fromPromise<FinalizeResult, { context: SessionMachineContext }>(
  async ({ input }) => {
    const { project, branch, user, chatId } = input.context;

    const snapshotId = branch.snapshot?.id;
    if (!snapshotId) {
      throw new Error("Branch has no snapshot");
    }

    const logger = Logger.get({
      projectId: project.id,
      branchId: branch.id,
      snapshotId,
      actor: "session-machine",
    });

    logger.info("Starting finalization");

    // Get changed files using Git library
    logger.info("Getting changed files from git");
    const changedFiles = await Git.getChangedFiles(project.id, branch.id, snapshotId);

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

      if (!branch.snapshot) {
        throw new Error("Branch has no snapshot");
      }

      // Use snapshot title/description for commit message, or fallback to generic message
      const snapshot = branch.snapshot;
      const commitMessage = snapshot.title
        ? `${snapshot.title}${snapshot.description ? `\n\n${snapshot.description}` : ""}`
        : "Session completed";

      const author = {
        name: user?.name ?? "Weldr",
        email: user?.email ?? "agent@weldr.dev",
      };

      try {
        commitHash = await Git.commit(commitMessage, author, project.id, snapshotId);
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

    logger.info("Syncing version to cloud storage");
    await syncToCloud(snapshotId, project.id);

    logger.info("Version synced to cloud");

    if (isCloudMode()) {
      logger.info("Building snapshot artifact", {
        extra: { snapshotId },
      });

      const buildResult = await build({
        projectId: project.id,
        snapshotId,
      });

      if (buildResult.success) {
        logger.info("Snapshot artifact built successfully", {
          extra: { snapshotId },
        });
      } else {
        logger.warn("Failed to build snapshot artifact (non-critical)", {
          extra: { snapshotId },
        });
      }
    }

    // Persist session metrics (cost, tokens, iterations, duration)
    const metrics = input.context.metrics.getMetrics();
    await persistSessionMetrics({
      snapshotId,
      metrics,
    });

    logger.info("Session metrics persisted", {
      extra: {
        totalCost: metrics.agent.llm.totalCost,
        inputTokens: metrics.agent.llm.inputTokens,
        outputTokens: metrics.agent.llm.outputTokens,
        iterations: metrics.agent.iterations,
      },
    });

    // Update snapshot with commit hash
    if (commitHash) {
      await db
        .update(snapshots)
        .set({
          commitSha: commitHash,
        })
        .where(eq(snapshots.id, snapshotId));
    }

    logger.info("Snapshot updated");

    await stream(chatId, {
      type: "update_branch",
      data: {
        ...branch,
        snapshot: branch.snapshot
          ? {
              ...branch.snapshot,
              commitSha: commitHash,
            }
          : null,
      },
    });

    logger.info("Finalization completed successfully");

    return { commitHash };
  },
);
