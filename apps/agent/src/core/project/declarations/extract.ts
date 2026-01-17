import * as path from "node:path";

import type { AgentFS } from "agentfs-sdk";

import { db, eq } from "@weldr/db";
import { Logger } from "@weldr/shared/logger";

import { getOrCreateWorkspace } from "@/core/workspace/just-bash/session";
import type { ExecutionContext } from "@/session";
import { extractAndSaveDeclarations } from "./query";

/**
 * File extensions that should have declarations extracted
 */
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs", ".cts", ".cjs"]);

/**
 * Directories to skip when scanning for code files
 */
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".turbo",
  "out",
  ".cache",
  "coverage",
  ".nyc_output",
  ".output",
  ".nitro",
  ".vercel",
  ".react-router",
]);

/**
 * Changed file information (compatible with Git.ChangedFile)
 */
export interface ChangedFile {
  path: string;
  type: "added" | "modified" | "deleted";
}

/**
 * Recursively walk directory and collect files matching criteria
 */
async function walkDirRecursive(
  agent: AgentFS,
  dirPath: string,
  options: { excludeDirs: Set<string>; extensions: Set<string> },
): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await agent.fs.readdir(dirPath);

    for (const entry of entries) {
      const fullPath = dirPath === "/" ? `/${entry}` : `${dirPath}/${entry}`;

      try {
        const stat = await agent.fs.stat(fullPath);

        if (stat.isDirectory()) {
          if (!options.excludeDirs.has(entry)) {
            const subFiles = await walkDirRecursive(agent, fullPath, options);
            results.push(...subFiles);
          }
        } else if (stat.isFile()) {
          const ext = path.extname(entry);
          if (options.extensions.has(ext)) {
            results.push(fullPath);
          }
        }
      } catch {
        // Skip entries that can't be stat'd
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return results;
}

/**
 * Scan workspace for code files using agentfs
 */
async function scanWorkspace(projectId: string, snapshotId: string): Promise<string[]> {
  const session = await getOrCreateWorkspace({ projectId, snapshotId });
  const files = await walkDirRecursive(session.agent, "/", {
    excludeDirs: EXCLUDED_DIRS,
    extensions: CODE_EXTENSIONS,
  });

  return files.map((f) => (f.startsWith("/") ? f.slice(1) : f));
}

/**
 * Extract declarations from all code files in the project.
 * This should be called after bash operations that modify files.
 *
 * @param context - Session context containing project and branch info
 * @param changedFiles - Optional list of specific files that changed. If not provided, scans all code files.
 */
export async function extractDeclarationsFromProject({
  context,
  changedFiles,
}: {
  context: ExecutionContext;
  changedFiles?: ChangedFile[];
}): Promise<{ processed: number; errors: string[] }> {
  const project = context.project;
  const branch = context.branch;
  const branchId = branch.id;

  const logger = Logger.get({
    projectId: project.id,
    snapshotId: branch.snapshot?.id,
  });

  if (!branch.snapshot) {
    logger.error("Branch has no snapshot");
    return { processed: 0, errors: ["Branch has no snapshot"] };
  }

  const snapshotId = branch.snapshot.id;
  const errors: string[] = [];
  let processed = 0;

  try {
    let filesToProcess: string[];
    let deletedFiles: string[] = [];

    if (changedFiles && changedFiles.length > 0) {
      filesToProcess = changedFiles
        .filter((f) => f.type !== "deleted")
        .filter((f) => CODE_EXTENSIONS.has(path.extname(f.path)))
        .map((f) => f.path);

      deletedFiles = changedFiles
        .filter((f) => f.type === "deleted")
        .filter((f) => CODE_EXTENSIONS.has(path.extname(f.path)))
        .map((f) => f.path);
    } else {
      logger.info("Scanning project for code files...");
      filesToProcess = await scanWorkspace(project.id, snapshotId);
    }

    logger.info(
      `Found ${filesToProcess.length} code files to process, ${deletedFiles.length} deleted files`,
    );

    // Handle deleted files - clean up their declarations
    for (const filePath of deletedFiles) {
      try {
        await handleFileDeleted({ context, filePath });
        processed++;
      } catch (error) {
        const errorMsg = `Failed to handle deleted file ${filePath}: ${error instanceof Error ? error.message : String(error)}`;
        logger.warn(errorMsg);
        errors.push(errorMsg);
      }
    }

    // Get session for reading files
    const session = await getOrCreateWorkspace({
      projectId: project.id,
      snapshotId,
    });

    // Process added/modified files
    for (const filePath of filesToProcess) {
      try {
        const agentfsPath = filePath.startsWith("/") ? filePath : `/${filePath}`;
        const sourceCode = await session.agent.fs.readFile(agentfsPath, "utf-8");

        await extractAndSaveDeclarations({
          context,
          filePath,
          sourceCode,
          branchId,
        });

        processed++;
      } catch (error) {
        const errorMsg = `Failed to process ${filePath}: ${error instanceof Error ? error.message : String(error)}`;
        logger.warn(errorMsg);
        errors.push(errorMsg);
      }
    }

    logger.info(`Processed ${processed} files, ${errors.length} errors`);

    return { processed, errors };
  } catch (error) {
    logger.error("Failed to extract declarations from project", {
      extra: { error: error instanceof Error ? error.message : String(error) },
    });
    return { processed, errors: [String(error)] };
  }
}

/**
 * Handle file deletion - removes declarations associated with the deleted file.
 *
 * @param context - Session context
 * @param filePath - Relative path to the deleted file
 */
export async function handleFileDeleted({
  context,
  filePath,
}: {
  context: ExecutionContext;
  filePath: string;
}): Promise<void> {
  const { and, inArray } = await import("@weldr/db");
  const { declarations, snapshotDeclarations } = await import("@weldr/db/schema");

  const branch = context.branch;

  const logger = Logger.get({
    projectId: context.project.id,
    snapshotId: branch.snapshot?.id,
  });

  if (!branch.snapshot) {
    logger.error("Branch has no snapshot");
    return;
  }

  const snapshotId = branch.snapshot.id;

  const declarationsList = await db.query.declarations.findMany({
    where: eq(declarations.path, filePath),
    columns: { id: true },
  });

  if (declarationsList.length > 0) {
    await db.delete(snapshotDeclarations).where(
      and(
        inArray(
          snapshotDeclarations.declarationId,
          declarationsList.map((d) => d.id),
        ),
        eq(snapshotDeclarations.snapshotId, snapshotId),
      ),
    );
    logger.info(`Deleted ${declarationsList.length} declarations for ${filePath}`);
  }
}
