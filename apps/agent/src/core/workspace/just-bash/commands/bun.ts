import { spawnSync } from "node:child_process";

import { defineCommand } from "just-bash";

import { Logger } from "@weldr/shared/logger";

import { createTempDir, syncFromRealFs, syncToRealFs } from "../sync";

const BUN_CACHE_DIR = "/tmp/weldr-bun-cache";

export function createBunCommand() {
  return defineCommand("bun", async (args, ctx) => {
    const logger = Logger.get({ component: "bun-command" });

    // 1. Create temp directory
    const tempDir = await createTempDir("weldr-bun-");

    try {
      // 2. Sync virtual FS to temp directory
      // Exclude: node_modules (bun install will recreate it)
      const syncOptions = {
        exclude: ["node_modules"],
        basePath: ctx.cwd,
      };

      await syncToRealFs(ctx.fs, tempDir.path, syncOptions);

      // 3. Execute real bun command
      const result = spawnSync("bun", args, {
        cwd: tempDir.path,
        encoding: "utf-8",
        env: {
          ...process.env,
          BUN_INSTALL_CACHE_DIR: BUN_CACHE_DIR,
        },
        maxBuffer: 50 * 1024 * 1024, // 50MB for bun output
        timeout: 10 * 60 * 1000, // 10 minutes for bun install
      });

      // 4. Sync changes back to virtual FS
      // Exclude: node_modules (never sync node_modules to virtual FS)
      await syncFromRealFs(tempDir.path, ctx.fs, syncOptions);

      // 5. Return result
      return {
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        exitCode: result.status ?? (result.error ? 1 : 0),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Bun command failed", { error: errorMessage });

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
