import * as path from "node:path";

import { db, eq } from "@weldr/db";
import { Logger } from "@weldr/shared/logger";

import { readFile, walkDir } from "@/lib/sandbox/fs";
import type { SessionContext } from "@/session";
import { extractAndSaveDeclarations } from "./declarations";

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
 * Scan workspace for code files using agentfs
 */
function scanWorkspace(branchId: string): string[] {
  const files = walkDir(branchId, "/", {
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
  context: SessionContext;
  changedFiles?: ChangedFile[];
}): Promise<{ processed: number; errors: string[] }> {
  const project = context.project;
  const branch = context.branch;
  const branchId = branch.id;

  const logger = Logger.get({
    projectId: project.id,
    versionId: branch.headVersion.id,
  });

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
      filesToProcess = scanWorkspace(branchId);
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

    // Process added/modified files
    for (const filePath of filesToProcess) {
      try {
        const agentfsPath = filePath.startsWith("/") ? filePath : `/${filePath}`;
        const result = readFile(branchId, agentfsPath);

        if (!result.success) {
          const errorMsg = `Failed to read ${filePath}: ${result.error}`;
          logger.warn(errorMsg);
          errors.push(errorMsg);
          continue;
        }

        const sourceCode = result.data ?? "";

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
  context: SessionContext;
  filePath: string;
}): Promise<void> {
  const { and, inArray } = await import("@weldr/db");
  const { declarations, versionDeclarations } = await import("@weldr/db/schema");

  const branch = context.branch;

  const logger = Logger.get({
    projectId: context.project.id,
    versionId: branch.headVersion.id,
  });

  const declarationsList = await db.query.declarations.findMany({
    where: eq(declarations.path, filePath),
    columns: { id: true },
  });

  if (declarationsList.length > 0) {
    await db.delete(versionDeclarations).where(
      and(
        inArray(
          versionDeclarations.declarationId,
          declarationsList.map((d) => d.id),
        ),
        eq(versionDeclarations.versionId, branch.headVersion.id),
      ),
    );
    logger.info(`Deleted ${declarationsList.length} declarations for ${filePath}`);
  }
}
