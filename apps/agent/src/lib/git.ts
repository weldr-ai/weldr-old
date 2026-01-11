import { Logger } from "@weldr/shared/logger";
import { getBranchDir } from "@weldr/shared/state";

import { execRealBinary, sandboxConnections } from "@/lib/sandbox";

const TRUNK_BRANCH = "main";

export namespace Git {
  export class MergeConflictError extends Error {
    constructor(
      public readonly conflicted: string[],
      public readonly sourceBranch: string,
      public readonly targetBranch: string,
    ) {
      super("Merge conflict during squash merge");
    }
  }

  interface GitExecOptions {
    projectId: string;
    branchId: string;
    branchDir: string;
  }

  async function execGit(
    args: string[],
    options: GitExecOptions,
    syncBackPatterns: string[] = [".git"],
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const { projectId, branchId, branchDir } = options;

    const agent = await sandboxConnections.acquire(projectId, branchId, branchDir);

    try {
      return await execRealBinary("git", args, {
        agent,
        branchDir,
        syncBackPatterns,
      });
    } finally {
      await sandboxConnections.release(projectId, branchId);
    }
  }

  async function execGitReadOnly(
    args: string[],
    options: GitExecOptions,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return execGit(args, options, []);
  }

  export interface ChangedFile {
    path: string;
    type: "added" | "modified" | "deleted";
  }

  export async function initRepository(
    projectId: string,
    branchId: string,
    branchDir?: string,
  ): Promise<string> {
    const repoPath = branchDir ?? getBranchDir(projectId, branchId);

    const logger = Logger.get({
      operation: "git-init",
      repoPath,
    });

    const options = { projectId, branchId, branchDir: repoPath };

    try {
      const result = await execGit(["init", "-b", TRUNK_BRANCH], options);

      if (result.exitCode !== 0) {
        throw new Error(`git init failed: ${result.stderr}`);
      }

      logger.info("Repository initialized", { extra: { repoPath } });
      return repoPath;
    } catch (error) {
      logger.error("Failed to initialize repository", { extra: { error } });
      throw error;
    }
  }

  export async function commit(
    message: string,
    author: { name: string; email: string },
    projectId: string,
    branchId: string,
    branchDir: string,
  ): Promise<string> {
    const logger = Logger.get({ operation: "git-commit" });
    const options = { projectId, branchId, branchDir };

    try {
      await execGit(["config", "user.name", author.name], options);
      await execGit(["config", "user.email", author.email], options);
      await execGit(["add", "-A"], options);

      const commitResult = await execGit(["commit", "-m", message], options);

      if (commitResult.exitCode !== 0) {
        if (commitResult.stdout.includes("nothing to commit")) {
          throw new Error("Nothing to commit");
        }
        throw new Error(`git commit failed: ${commitResult.stderr}`);
      }

      const hashResult = await execGitReadOnly(["rev-parse", "HEAD"], options);
      const commitHash = hashResult.stdout.trim();

      logger.info("Commit created", { extra: { commit: commitHash } });
      return commitHash;
    } catch (error) {
      logger.error("Failed to create commit", { extra: { error, message } });
      throw error;
    }
  }

  export async function checkoutBranch(
    branchName: string,
    startRef: string | undefined,
    projectId: string,
    branchId: string,
    branchDir: string,
  ): Promise<string> {
    const logger = Logger.get({
      operation: "git-checkout-branch",
      branchName,
      startRef,
    });

    const options = { projectId, branchId, branchDir };

    try {
      const branchExists = await checkBranchExists(branchName, options);

      if (branchExists) {
        await execGit(["checkout", branchName], options);
        logger.info("Checked out existing branch", { extra: { branchName } });
      } else {
        if (!startRef) {
          throw new Error(`Branch "${branchName}" does not exist and no startRef was provided`);
        }
        await execGit(["checkout", "-b", branchName, startRef], options);
        logger.info("Created and checked out new branch", {
          extra: { branchName, startRef },
        });
      }

      return branchDir;
    } catch (error) {
      logger.error("Failed to checkout branch", { extra: { error } });
      throw error;
    }
  }

  export async function hasGitRepository(
    projectId: string,
    branchId: string,
    branchDir: string,
  ): Promise<boolean> {
    const options = { projectId, branchId, branchDir };
    const result = await execGitReadOnly(["rev-parse", "--git-dir"], options);
    return result.exitCode === 0;
  }

  export async function getChangedFiles(
    projectId: string,
    branchId: string,
    branchDir: string,
    fromRef?: string,
    toRef?: string,
  ): Promise<ChangedFile[]> {
    const logger = Logger.get({
      operation: "git-get-changed-files",
      branchDir,
      fromRef,
      toRef,
    });

    const options = { projectId, branchId, branchDir };
    const changedFiles: ChangedFile[] = [];

    try {
      let result: { stdout: string; exitCode: number };

      if (fromRef && toRef) {
        result = await execGitReadOnly(["diff", "--name-status", fromRef, toRef], options);
      } else if (fromRef) {
        result = await execGitReadOnly(["diff", "--name-status", fromRef], options);
      } else {
        result = await execGitReadOnly(["status", "--porcelain"], options);
      }

      if (!result.stdout.trim()) {
        logger.debug("No changed files found");
        return [];
      }

      const lines = result.stdout.trim().split("\n");

      for (const line of lines) {
        if (!line.trim()) continue;

        let type: ChangedFile["type"];
        let filePath: string;

        if (fromRef || toRef) {
          const [status, ...pathParts] = line.split("\t");
          filePath = pathParts.join("\t");

          switch (status?.charAt(0)) {
            case "A":
              type = "added";
              break;
            case "D":
              type = "deleted";
              break;
            default:
              type = "modified";
              break;
          }
        } else {
          const statusCode = line.substring(0, 2);
          filePath = line.substring(3);

          if (statusCode.includes("D")) {
            type = "deleted";
          } else if (statusCode.includes("A") || statusCode.includes("?")) {
            type = "added";
          } else {
            type = "modified";
          }
        }

        if (filePath) {
          changedFiles.push({ path: filePath, type });
        }
      }

      logger.debug("Changed files retrieved", {
        extra: { count: changedFiles.length },
      });

      return changedFiles;
    } catch (error) {
      logger.error("Failed to get changed files", { extra: { error } });
      return [];
    }
  }

  export async function headCommit(
    projectId: string,
    branchId: string,
    branchDir: string,
  ): Promise<string> {
    const result = await execGitReadOnly(["rev-parse", "HEAD"], { projectId, branchId, branchDir });
    return result.stdout.trim();
  }

  export async function getParentCommit(
    projectId: string,
    branchId: string,
    branchDir: string,
  ): Promise<string | null> {
    const result = await execGitReadOnly(["rev-parse", "HEAD~1"], {
      projectId,
      branchId,
      branchDir,
    });
    if (result.exitCode !== 0) {
      return null;
    }
    return result.stdout.trim();
  }

  export async function renameBranch(
    oldName: string,
    newName: string,
    projectId: string,
    branchId: string,
    branchDir: string,
  ): Promise<void> {
    const logger = Logger.get({
      operation: "git-rename-branch",
      oldName,
      newName,
    });

    const options = { projectId, branchId, branchDir };

    try {
      const result = await execGit(["branch", "-m", oldName, newName], options);

      if (result.exitCode !== 0) {
        throw new Error(`git branch rename failed: ${result.stderr}`);
      }

      logger.info("Branch renamed", { extra: { oldName, newName } });
    } catch (error) {
      logger.error("Failed to rename branch", { extra: { error, oldName, newName } });
      throw error;
    }
  }

  export async function revert(
    targetBranch: string,
    commitHash: string,
    message: string | undefined,
    projectId: string,
    branchId: string,
    branchDir: string,
  ): Promise<string> {
    const logger = Logger.get({
      operation: "git-revert",
      targetBranch,
      commitHash,
    });

    const options = { projectId, branchId, branchDir };

    try {
      await execGit(["checkout", targetBranch], options);
      await execGit(["revert", "--no-edit", commitHash], options);

      const commitResult = await execGit(
        ["commit", "-m", message ?? `revert: ${commitHash}`],
        options,
      );

      if (commitResult.exitCode !== 0) {
        throw new Error(`git revert commit failed: ${commitResult.stderr}`);
      }

      const hashResult = await execGitReadOnly(["rev-parse", "HEAD"], options);
      const newCommitHash = hashResult.stdout.trim();

      logger.info("Revert completed", { extra: { commit: newCommitHash } });
      return newCommitHash;
    } catch (e) {
      await execGit(["revert", "--abort"], options).catch(() => {});
      logger.error("Revert failed", { extra: { error: e } });
      throw e;
    }
  }

  async function checkBranchExists(branchName: string, options: GitExecOptions): Promise<boolean> {
    const result = await execGitReadOnly(
      ["show-ref", "--verify", `refs/heads/${branchName}`],
      options,
    );
    return result.exitCode === 0;
  }

  export function getMainRepoPath(projectId: string, mainBranchId: string): string {
    return getBranchDir(projectId, mainBranchId);
  }

  export function getBranchWorkspacePath(projectId: string, branchId: string): string {
    return getBranchDir(projectId, branchId);
  }
}
