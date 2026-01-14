import { spawnSync } from "node:child_process";

import { defineCommand } from "just-bash";

import { Logger } from "@weldr/shared/logger";

import { createTempDir, syncFromRealFs, syncToRealFs } from "../sync";

export function createGitCommand() {
  return defineCommand("git", async (args, ctx) => {
    const logger = Logger.get({ component: "git-command" });

    // 1. Create temp directory
    const tempDir = await createTempDir("weldr-git-");

    try {
      // 2. Sync virtual FS to temp directory
      // Exclude: node_modules (too large, not needed for git)
      const syncOptions = {
        exclude: ["node_modules"],
        basePath: ctx.cwd,
      };

      await syncToRealFs(ctx.fs, tempDir.path, syncOptions);

      // 3. Execute real git command
      const result = spawnSync("git", args, {
        cwd: tempDir.path,
        encoding: "utf-8",
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
        },
        maxBuffer: 10 * 1024 * 1024,
        timeout: 5 * 60 * 1000, // 5 minutes
      });

      // 4. Sync changes back to virtual FS
      // Exclude: node_modules
      await syncFromRealFs(tempDir.path, ctx.fs, syncOptions);

      // 5. Return result
      return {
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        exitCode: result.status ?? (result.error ? 1 : 0),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Git command failed", { error: errorMessage });

      return {
        stdout: "",
        stderr: errorMessage,
        exitCode: 1,
      };
    } finally {
      // 6. Cleanup temp directory
      await tempDir.cleanup();
    }
  });
}
