import { db, eq } from "@weldr/db";
import { versions } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";
import { getBranchDir, isCloudMode } from "@weldr/shared/state";

import { syncBranchToStorage } from "@/lib/branch-state";
import { build } from "@/lib/build";
import { Git } from "@/lib/git";
import {
  createSnapshotService,
  openAgentFS,
  syncDiskToAgentFS,
} from "@/lib/storage";
import { stream } from "@/lib/stream-utils";
import { createStep } from "../engine";

export const finalizingStep = createStep({
  id: "finalizing",
  execute: async ({ context }) => {
    const project = context.get("project");
    const branch = context.get("branch");
    const user = context.get("user");

    const logger = Logger.get({
      projectId: project.id,
      versionId: branch.headVersion.id,
    });

    logger.info("Starting finalize step");

    try {
      const branchDir = getBranchDir(project.id, branch.id);

      // 1. Sync disk changes to AgentFS filesystem
      logger.info("Syncing disk changes to AgentFS");
      const agent = await openAgentFS(branchDir);
      let synced: number;
      let errors: string[];
      try {
        const result = await syncDiskToAgentFS(agent, branchDir);
        synced = result.synced;
        errors = result.errors;
      } finally {
        await agent.close();
      }

      logger.info("Disk synced to AgentFS", {
        extra: { synced, errorCount: errors.length },
      });

      // 2. Create git commit (user-facing history)
      logger.info("Creating git commit");

      const commitMessage = branch.headVersion.message
        ? `${branch.headVersion.message}${branch.headVersion.description ? `\n\n${branch.headVersion.description}` : ""}`
        : `Version #${branch.headVersion.sequenceNumber}`;

      let commitHash: string | null = null;
      try {
        commitHash = await Git.commit(
          commitMessage,
          {
            name: user?.name || "Weldr",
            email: user?.email || "agent@weldr.dev",
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

      // 3. Sync branch to S3 storage (works for both local MinIO and cloud Tigris)
      logger.info("Syncing branch to storage");
      await syncBranchToStorage(branch.id, project.id);

      // 4. Create AgentFS snapshot (copy .db file in S3)
      logger.info("Creating AgentFS snapshot");

      const snapshotService = createSnapshotService(project.id);
      const snapshotPath = await snapshotService.createSnapshot(
        branch.id,
        branch.headVersion.id,
      );

      logger.info("Snapshot created", { extra: { snapshotPath } });

      // 5. Cloud mode only: build for Fly.io deployment
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

      // 6. Update database with both references
      await db
        .update(versions)
        .set({
          status: "completed",
          commitHash,
          snapshotPath,
        })
        .where(eq(versions.id, branch.headVersion.id));

      logger.info("Version marked as completed");

      // 7. Update context and notify clients
      const updatedVersion = {
        ...branch.headVersion,
        status: "completed" as const,
        commitHash,
        snapshotPath,
      };

      context.set("branch", { ...branch, headVersion: updatedVersion });

      await stream(branch.headVersion.chatId, {
        type: "update_branch",
        data: {
          ...branch,
          headVersion: updatedVersion,
        },
      });

      logger.info("Finalize step completed successfully");
    } catch (error) {
      logger.error("Finalize step failed", {
        extra: { error },
      });
      throw error;
    }
  },
});
