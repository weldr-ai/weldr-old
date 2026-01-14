import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import type { IFileSystem } from "just-bash";

import { Logger } from "@weldr/shared/logger";

export interface SyncOptions {
  exclude?: string[];
  basePath?: string;
}

export interface TempDirHandle {
  path: string;
  cleanup: () => Promise<void>;
}

const logger = Logger.get({ component: "fs-sync" });

export async function createTempDir(prefix: string): Promise<TempDirHandle> {
  const tempPath = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  logger.debug("Created temp directory", { path: tempPath });

  return {
    path: tempPath,
    cleanup: async () => {
      try {
        await fs.rm(tempPath, { recursive: true, force: true });
        logger.debug("Cleaned up temp directory", { path: tempPath });
      } catch (error) {
        logger.warn("Failed to cleanup temp directory", {
          path: tempPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}

export function shouldExclude(relativePath: string, excludePatterns: string[]): boolean {
  const normalizedPath = relativePath.replace(/\\/g, "/");
  const pathParts = normalizedPath.split("/").filter(Boolean);

  for (const pattern of excludePatterns) {
    if (pathParts.includes(pattern)) {
      return true;
    }

    if (normalizedPath.includes(pattern)) {
      return true;
    }
  }

  return false;
}

export async function syncToRealFs(
  virtualFs: IFileSystem,
  targetDir: string,
  options?: SyncOptions,
): Promise<{ synced: number; errors: string[] }> {
  const basePath = options?.basePath ?? "/";
  const excludePatterns = options?.exclude ?? [];
  let synced = 0;
  const errors: string[] = [];

  async function walkVirtualFs(virtualPath: string): Promise<void> {
    const relativePath = virtualPath === basePath ? "" : virtualPath.slice(basePath.length);

    if (relativePath && shouldExclude(relativePath, excludePatterns)) {
      logger.debug("Excluding path from sync", { path: relativePath });
      return;
    }

    try {
      const entries = await virtualFs.readdir(virtualPath);

      for (const entry of entries) {
        const entryVirtualPath = path.posix.join(virtualPath, entry);
        const entryRelativePath = entryVirtualPath.slice(basePath.length);

        if (shouldExclude(entryRelativePath, excludePatterns)) {
          logger.debug("Excluding entry from sync", { path: entryRelativePath });
          continue;
        }

        try {
          const stats = await virtualFs.stat(entryVirtualPath);
          const realPath = path.join(targetDir, entryRelativePath);

          // Handle both function (just-bash InMemoryFs) and boolean (agentfs wrapper) forms
          const isDir =
            typeof stats.isDirectory === "function" ? stats.isDirectory() : stats.isDirectory;
          const isFile = typeof stats.isFile === "function" ? stats.isFile() : stats.isFile;

          if (isDir) {
            await fs.mkdir(realPath, { recursive: true });
            await walkVirtualFs(entryVirtualPath);
          } else if (isFile) {
            await fs.mkdir(path.dirname(realPath), { recursive: true });
            const content = await virtualFs.readFileBuffer(entryVirtualPath);
            await fs.writeFile(realPath, content);
            synced++;
          }
        } catch (error) {
          const errorMessage = `Failed to sync ${entryVirtualPath}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMessage);
          logger.warn("Sync error", { path: entryVirtualPath, error: errorMessage });
        }
      }
    } catch (error) {
      const errorMessage = `Failed to read directory ${virtualPath}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMessage);
      logger.warn("Directory read error", { path: virtualPath, error: errorMessage });
    }
  }

  logger.info("Starting sync to real filesystem", { targetDir, basePath });
  await walkVirtualFs(basePath);
  logger.info("Completed sync to real filesystem", { synced, errorCount: errors.length });

  return { synced, errors };
}

export async function syncFromRealFs(
  sourceDir: string,
  virtualFs: IFileSystem,
  options?: SyncOptions,
): Promise<{ synced: number; errors: string[] }> {
  const basePath = options?.basePath ?? "/";
  const excludePatterns = options?.exclude ?? [];
  let synced = 0;
  const errors: string[] = [];

  async function walkRealFs(realPath: string): Promise<void> {
    const relativePath = path.relative(sourceDir, realPath);

    if (relativePath && shouldExclude(relativePath, excludePatterns)) {
      logger.debug("Excluding path from sync", { path: relativePath });
      return;
    }

    try {
      const entries = await fs.readdir(realPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryRealPath = path.join(realPath, entry.name);
        const entryRelativePath = path.relative(sourceDir, entryRealPath);

        if (shouldExclude(entryRelativePath, excludePatterns)) {
          logger.debug("Excluding entry from sync", { path: entryRelativePath });
          continue;
        }

        const virtualPath = path.posix.join(basePath, entryRelativePath.replace(/\\/g, "/"));

        try {
          if (entry.isDirectory()) {
            await virtualFs.mkdir(virtualPath, { recursive: true });
            await walkRealFs(entryRealPath);
          } else if (entry.isFile()) {
            const parentDir = path.posix.dirname(virtualPath);
            if (parentDir !== basePath) {
              await virtualFs.mkdir(parentDir, { recursive: true });
            }
            const content = await fs.readFile(entryRealPath);
            await virtualFs.writeFile(virtualPath, content);
            synced++;
          }
        } catch (error) {
          const errorMessage = `Failed to sync ${entryRealPath}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMessage);
          logger.warn("Sync error", { path: entryRealPath, error: errorMessage });
        }
      }
    } catch (error) {
      const errorMessage = `Failed to read directory ${realPath}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMessage);
      logger.warn("Directory read error", { path: realPath, error: errorMessage });
    }
  }

  logger.info("Starting sync from real filesystem", { sourceDir, basePath });
  await walkRealFs(sourceDir);
  logger.info("Completed sync from real filesystem", { synced, errorCount: errors.length });

  return { synced, errors };
}
