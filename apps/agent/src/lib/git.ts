import fs from "node:fs/promises";
import path from "node:path";

import { simpleGit } from "simple-git";

import { Logger } from "@weldr/shared/logger";
import { getBranchDir, getMainRepoPath as getMainRepoPathFromState } from "@weldr/shared/state";

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

  /**
   * Initialize repo on TRUNK_BRANCH with an initial empty commit.
   * @param projectId - The project ID (required if branchDir not provided)
   * @param branchId - The branch ID (required if branchDir not provided)
   * @param branchDir - The branch directory path (optional, will be calculated if not provided)
   */
  export async function initRepository(
    projectId: string | undefined,
    branchId: string | undefined,
    branchDir?: string,
  ): Promise<string> {
    const repoPath =
      branchDir ?? (projectId && branchId ? getBranchDir(projectId, branchId) : undefined);

    if (!repoPath) {
      throw new Error("initRepository requires either branchDir or both projectId and branchId");
    }

    const logger = Logger.get({
      operation: "git-init",
      repoPath,
    });

    try {
      await fs.mkdir(repoPath, { recursive: true });

      // Initialize and set trunk branch explicitly
      const git = simpleGit(repoPath);
      await git.raw(["init", "-b", TRUNK_BRANCH]);

      // Create an initial empty commit so splits/branches have a base
      await git.add(".");
      logger.info("Repository initialized", { extra: { repoPath } });
      return repoPath;
    } catch (error) {
      logger.error("Failed to initialize repository", { extra: { error } });
      throw error;
    }
  }

  /**
   * Stages all changes and creates a commit in the repository.
   *
   * @param message - The commit message
   * @param author - The author name for the commit
   * @param email - The author email for the commit
   * @param branchDir - The branch directory path
   * @returns The commit hash
   * @throws {Error} When commit creation fails
   */
  export async function commit(
    message: string,
    author: { name: string; email: string },
    branchDir: string,
  ): Promise<string> {
    const logger = Logger.get({ operation: "git-commit" });
    const git = simpleGit(branchDir);

    try {
      await git.add(".");
      const result = await git.commit(message, undefined, {
        "--author": `${author.name} <${author.email}>`,
      });
      logger.info("Commit created", {
        extra: {
          commit: result.commit,
        },
      });
      return result.commit;
    } catch (error) {
      logger.error("Failed to create commit", { extra: { error, message } });
      throw error;
    }
  }

  /**
   * Create or checkout a branch.
   * @param branchName - The name of the branch to create
   * @param startRef - The starting ref (branch name or commit hash)
   * @param branchDir - The branch directory path
   * @returns The branch directory
   * @throws {Error} When branch creation fails
   */
  export async function checkoutBranch(
    branchName: string,
    startRef: string | undefined,
    branchDir: string,
  ): Promise<string> {
    const logger = Logger.get({
      operation: "git-checkout-branch",
      branchName,
      startRef,
    });

    const git = simpleGit(branchDir);

    try {
      // Check if branch exists
      const branchExists = await checkBranchExists(branchName, branchDir);

      if (branchExists) {
        // Branch exists, just checkout
        await git.checkout(branchName);
        logger.info("Checked out existing branch", { extra: { branchName } });
      } else {
        // Branch doesn't exist, create it
        if (!startRef) {
          throw new Error(`Branch "${branchName}" does not exist and no startRef was provided`);
        }
        await git.checkoutBranch(branchName, startRef);
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

  /**
   * Squash-merge source branch onto the target branch.
   * Returns the new commit hash created on the target.
   * @param sourceBranch - The source branch
   * @param targetBranch - The target branch
   * @param message - The message for the commit
   * @param author - The author of the commit
   * @param branchDir - The branch directory path
   * @param opts - Optional merge options
   * @returns The hash of the new commit
   * @throws {Error} When squash merge fails
   */
  export async function squashMerge(
    sourceBranch: string,
    targetBranch: string,
    message: string,
    author: { name: string; email: string },
    branchDir: string,
    opts?: {
      preflightRebase?: boolean;
      fetch?: boolean;
      push?: boolean;
    },
  ): Promise<string> {
    const logger = Logger.get({
      operation: "git-squash-merge",
      sourceBranch,
      targetBranch,
    });

    const git = simpleGit(branchDir);

    if (opts?.fetch) {
      try {
        await git.fetch();
      } catch {}
    }

    // compute commits that will be squashed (for message + co-authors)
    const commits = await commitsBetween(targetBranch, sourceBranch, branchDir);
    const coauthors = Array.from(
      new Map(
        commits.map((c) => [c.authorEmail, { name: c.authorName, email: c.authorEmail }]),
      ).values(),
    );

    const commitMessage = buildSquashMessage({
      message,
      commits: commits.map((c) => ({ title: c.title, hash: c.hash })),
      coauthors,
    });

    // optional: rebase source onto target tip first (reduces conflicts on long-lived branches)
    if (opts?.preflightRebase) {
      try {
        await git.checkout(sourceBranch);
        await git.raw(["rebase", targetBranch]);
      } catch (e) {
        try {
          await git.raw(["rebase", "--abort"]);
        } catch {}
        throw e;
      }
    }

    // Checkout target branch
    await git.checkout(targetBranch);

    // Verify we're on the target branch
    const currentBranch = (await git.raw(["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    if (currentBranch !== targetBranch) {
      throw new Error(`Expected to be on ${targetBranch}, on ${currentBranch}`);
    }

    try {
      await git.merge([sourceBranch, "--squash", "--no-commit"]);
    } catch (error) {
      // abort/reset and throw clean error
      const status = await git.status().catch(() => undefined);
      const conflicted = status?.conflicted ?? [];
      try {
        await git.raw(["merge", "--abort"]);
      } catch {
        try {
          await git.raw(["reset", "--merge"]);
        } catch {}
      }
      logger.error("Merge conflict", {
        extra: { conflicted, sourceBranch, targetBranch, error },
      });
      const err = new MergeConflictError(conflicted, sourceBranch, targetBranch);
      throw err;
    }

    // single squash commit, authored by the chosen user
    const { commit } = await git.commit(commitMessage, undefined, {
      "--author": `${author.name} <${author.email}>`,
    });

    if (opts?.push) {
      try {
        await git.push(["-u", "origin", targetBranch]);
      } catch {}
    }

    logger.info("Squash merge completed", { extra: { commit } });
    return commit;
  }

  /**
   * Create a new revert commit in the target branch against the given commit hash.
   * @param targetBranch - The target branch
   * @param commitHash - The hash of the commit to revert
   * @param message - The message for the revert commit
   * @param branchDir - The branch directory path
   * @returns The hash of the new revert commit
   * @throws {Error} When revert commit fails
   */
  export async function revert(
    targetBranch: string,
    commitHash: string,
    message: string | undefined,
    branchDir: string,
  ): Promise<string> {
    const logger = Logger.get({
      operation: "git-revert",
      targetBranch,
      commitHash,
    });
    const git = simpleGit(branchDir);

    try {
      await git.checkout(targetBranch);
      await git.raw(["revert", "--no-edit", commitHash]);
      const { commit } = await git.commit(message ?? `revert: ${commitHash}`);
      logger.info("Revert completed", { extra: { commit } });
      return commit;
    } catch (e) {
      try {
        await git.raw(["revert", "--abort"]);
      } catch {}
      logger.error("Revert failed", { extra: { error: e } });
      throw e;
    }
  }

  /**
   * Get the hash of the head commit.
   * @param branchDir - The branch directory path
   * @returns The hash of the head commit
   */
  export async function headCommit(branchDir: string): Promise<string> {
    const git = simpleGit(branchDir);
    return (await git.revparse(["HEAD"])).trim();
  }

  /**
   * Check if a git repository exists.
   * @param repoPath - The path to check
   * @returns True if the git repository exists, false otherwise
   */
  export async function hasGitRepository(repoPath: string): Promise<boolean> {
    const gitDir = path.join(repoPath, ".git");
    return await exists(gitDir);
  }

  /**
   * Get the main git repository path from project ID and main branch ID.
   * Unified structure for both local and cloud modes.
   * @param projectId - The project ID
   * @param mainBranchId - The main branch ID
   * @returns The path to the main git repository
   */
  export function getMainRepoPath(projectId: string, mainBranchId: string): string {
    return getMainRepoPathFromState(projectId, mainBranchId);
  }

  /**
   * Get the branch workspace path.
   * Unified structure for both local and cloud modes.
   * @param projectId - The project ID
   * @param branchId - The branch ID
   * @returns The path to the branch workspace
   */
  export function getBranchWorkspacePath(projectId: string, branchId: string): string {
    return getBranchDir(projectId, branchId);
  }

  /**
   * Ensure the main git repository exists and is initialized.
   * @param projectId - The project ID
   * @param mainBranchId - The main branch ID
   * @returns The path to the main git repository
   */
  export async function ensureMainRepo(projectId: string, mainBranchId: string): Promise<string> {
    const repoPath = getMainRepoPath(projectId, mainBranchId);
    const logger = Logger.get({
      operation: "git-ensure-main-repo",
      repoPath,
      projectId,
      mainBranchId,
    });

    const hasRepo = await hasGitRepository(repoPath);
    if (!hasRepo) {
      logger.info("Main repository does not exist, initializing", {
        extra: { repoPath },
      });
      // Initialize at the main repo path
      await initRepository(projectId, mainBranchId, repoPath);
    } else {
      logger.info("Main repository already exists", { extra: { repoPath } });
    }

    return repoPath;
  }

  /**
   * Create a git worktree from a commit hash.
   * @param projectId - The project ID
   * @param mainBranchId - The main branch ID (where the main repo is)
   * @param branchId - The branch ID for the worktree
   * @param commitHash - The commit hash to checkout
   * @param branchName - The name for the git branch (optional)
   * @returns The path to the worktree
   */
  export async function createWorktree(
    projectId: string,
    mainBranchId: string,
    branchId: string,
    commitHash: string,
    branchName?: string,
  ): Promise<string> {
    const logger = Logger.get({
      operation: "git-create-worktree",
      projectId,
      mainBranchId,
      branchId,
      commitHash,
      branchName,
    });

    const mainRepoPath = getMainRepoPath(projectId, mainBranchId);
    const worktreePath = getBranchWorkspacePath(projectId, branchId);

    // Ensure main repo exists
    await ensureMainRepo(projectId, mainBranchId);

    const git = simpleGit(mainRepoPath);

    try {
      // Check if worktree already exists
      const worktreeExists = await exists(worktreePath);
      if (worktreeExists) {
        logger.info("Worktree already exists", { extra: { worktreePath } });
        return worktreePath;
      }

      // Create worktree from commit hash
      // If branchName is provided, create a named branch
      if (branchName) {
        await git.raw(["worktree", "add", "-b", branchName, worktreePath, commitHash]);
        logger.info("Worktree created with named branch", {
          extra: { worktreePath, commitHash, branchName },
        });
      } else {
        await git.raw(["worktree", "add", worktreePath, commitHash]);
        logger.info("Worktree created", {
          extra: { worktreePath, commitHash },
        });
      }

      return worktreePath;
    } catch (error) {
      logger.error("Failed to create worktree", {
        extra: { error, projectId, mainBranchId, branchId, commitHash },
      });
      throw error;
    }
  }

  /**
   * Rename a git branch.
   * @param oldName - The old branch name
   * @param newName - The new branch name
   * @param branchDir - The branch directory path
   */
  export async function renameBranch(
    oldName: string,
    newName: string,
    branchDir: string,
  ): Promise<void> {
    const logger = Logger.get({
      operation: "git-rename-branch",
      oldName,
      newName,
    });

    const git = simpleGit(branchDir);

    try {
      // Rename the branch (use -m to move/rename)
      await git.raw(["branch", "-m", oldName, newName]);

      logger.info("Branch renamed", {
        extra: { oldName, newName },
      });
    } catch (error) {
      logger.error("Failed to rename branch", {
        extra: { error, oldName, newName },
      });
      throw error;
    }
  }

  /**
   * Remove a git worktree.
   * @param projectId - The project ID
   * @param mainBranchId - The main branch ID (where the main repo is)
   * @param branchId - The branch ID for the worktree to remove
   */
  export async function removeWorktree(
    projectId: string,
    mainBranchId: string,
    branchId: string,
  ): Promise<void> {
    const logger = Logger.get({
      operation: "git-remove-worktree",
      projectId,
      mainBranchId,
      branchId,
    });

    const mainRepoPath = getMainRepoPath(projectId, mainBranchId);
    const worktreePath = getBranchWorkspacePath(projectId, branchId);

    const git = simpleGit(mainRepoPath);

    try {
      // Check if worktree exists
      const worktreeExists = await exists(worktreePath);
      if (!worktreeExists) {
        logger.info("Worktree does not exist, nothing to remove", {
          extra: { worktreePath },
        });
        return;
      }

      // Remove worktree
      await git.raw(["worktree", "remove", worktreePath]);

      logger.info("Worktree removed", { extra: { worktreePath } });
    } catch (error) {
      logger.error("Failed to remove worktree", {
        extra: { error, projectId, mainBranchId, branchId },
      });
      throw error;
    }
  }

  /**
   * Changed file information from git diff.
   */
  export interface ChangedFile {
    path: string;
    type: "added" | "modified" | "deleted";
  }

  /**
   * Get changed files between two refs using git diff.
   * If no refs provided, gets uncommitted changes (staged + unstaged).
   *
   * @param branchDir - The branch directory path
   * @param fromRef - The starting ref (optional, defaults to HEAD for uncommitted changes)
   * @param toRef - The ending ref (optional)
   * @returns List of changed files with their change type
   */
  export async function getChangedFiles(
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

    const git = simpleGit(branchDir);
    const changedFiles: ChangedFile[] = [];

    try {
      let raw: string;

      if (fromRef && toRef) {
        raw = await git.raw(["diff", "--name-status", fromRef, toRef]);
      } else if (fromRef) {
        raw = await git.raw(["diff", "--name-status", fromRef]);
      } else {
        raw = await git.raw(["status", "--porcelain"]);
      }

      if (!raw.trim()) {
        logger.debug("No changed files found");
        return [];
      }

      const lines = raw.trim().split("\n");

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
            case "M":
            case "R":
            case "C":
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

  /**
   * Get the parent commit hash (HEAD~1).
   * Returns null if there's no parent (initial commit).
   *
   * @param branchDir - The branch directory path
   * @returns The parent commit hash or null
   */
  export async function getParentCommit(branchDir: string): Promise<string | null> {
    const git = simpleGit(branchDir);
    try {
      const parentHash = (await git.raw(["rev-parse", "HEAD~1"])).trim();
      return parentHash;
    } catch {
      return null;
    }
  }

  /**
   * Check if a path exists.
   * @param p - The path to check
   * @returns True if the path exists, false otherwise
   */
  async function exists(p: string): Promise<boolean> {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a local branch exists.
   * @param branchName - The name of the branch to check
   * @param branchDir - The branch directory path
   * @returns True if the branch exists, false otherwise
   * @throws {Error} When checking for branch existence fails
   */
  async function checkBranchExists(branchName: string, branchDir: string): Promise<boolean> {
    const git = simpleGit(branchDir);
    try {
      // exits 0 if ref exists
      await git.raw(["show-ref", "--verify", `refs/heads/${branchName}`]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the commits between two refs.
   * @param fromRef - The from ref
   * @param toRef - The to ref
   * @param branchDir - The branch directory path
   * @returns The commits between the two refs
   */
  async function commitsBetween(
    fromRef: string,
    toRef: string,
    branchDir: string,
  ): Promise<
    Array<{
      hash: string;
      title: string;
      body: string;
      authorName: string;
      authorEmail: string;
    }>
  > {
    const git = simpleGit(branchDir);
    // commits that are in source but not in target (i.e., target..source)
    const range = `${fromRef}..${toRef}`;
    const format = ["%H", "%s", "%b", "%an", "%ae"].join("%x1f"); // unit sep
    const raw = await git.raw(["log", "--no-merges", `--format=${format}`, range]).catch(() => "");
    if (!raw.trim()) return [];
    return raw
      .trim()
      .split("\n")
      .map((line) => {
        const [hash, title, body, authorName, authorEmail] = line.split("\x1f");
        return {
          hash: hash ?? "",
          title: title ?? "",
          body: body?.trim() ?? "",
          authorName: authorName ?? "",
          authorEmail: authorEmail ?? "",
        };
      });
  }

  /**
   * Build the squash message.
   * @param opts - The options
   * @returns The squash message
   */
  function buildSquashMessage(opts: {
    message: string;
    commits: Array<{ title: string; hash: string }>;
    coauthors: Array<{ name: string; email: string }>;
  }): string {
    const list =
      opts.commits.length > 0
        ? opts.commits.map((c) => `- ${c.title} (${c.hash.slice(0, 7)})`).join("\n")
        : "- No distinct commits (fast squash)";
    const trailers =
      opts.coauthors.length > 0
        ? "\n\n" +
          Array.from(
            new Map(opts.coauthors.map((a) => [a.email, a])) // dedupe by email
              .values(),
          )
            .map((a) => `Co-authored-by: ${a.name} <${a.email}>`)
            .join("\n")
        : "";
    return `${opts.message}\n\n${list}${trailers}`;
  }
}
