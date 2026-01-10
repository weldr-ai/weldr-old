import { promises as fs } from "node:fs";
import * as path from "node:path";

import { db, eq } from "@weldr/db";
import { versions } from "@weldr/db/schema";
import { mergeJson } from "@weldr/db/utils";
import { Logger } from "@weldr/shared/logger";
import { getBranchDir } from "@weldr/shared/state";

import type { WorkflowContext } from "@/workflow/context";
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

interface ChangedFile {
  path: string;
  type: "added" | "modified" | "deleted";
}

/**
 * Recursively scan a directory for code files
 */
async function scanDirectory(
  dir: string,
  baseDir: string,
  files: string[] = [],
): Promise<string[]> {
  let entries: { name: string; isDirectory: () => boolean }[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, entryPath);

    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        await scanDirectory(entryPath, baseDir, files);
      }
    } else {
      const ext = path.extname(entry.name);
      if (CODE_EXTENSIONS.has(ext)) {
        files.push(relativePath);
      }
    }
  }

  return files;
}

/**
 * Extract declarations from all code files in the project.
 * This should be called after bash operations that modify files.
 *
 * @param context - Workflow context containing project and branch info
 * @param changedFiles - Optional list of specific files that changed. If not provided, scans all code files.
 */
export async function extractDeclarationsFromProject({
  context,
  changedFiles,
}: {
  context: WorkflowContext;
  changedFiles?: ChangedFile[];
}): Promise<{ processed: number; errors: string[] }> {
  const project = context.get("project");
  const branch = context.get("branch");
  const branchDir = getBranchDir(project.id, branch.id);

  const logger = Logger.get({
    projectId: project.id,
    versionId: branch.headVersion.id,
  });

  const errors: string[] = [];
  let processed = 0;

  try {
    let filesToProcess: string[];

    if (changedFiles && changedFiles.length > 0) {
      filesToProcess = changedFiles
        .filter((f) => f.type !== "deleted")
        .filter((f) => CODE_EXTENSIONS.has(path.extname(f.path)))
        .map((f) => f.path);
    } else {
      logger.info("Scanning project for code files...");
      filesToProcess = await scanDirectory(branchDir, branchDir);
    }

    logger.info(`Found ${filesToProcess.length} code files to process`);

    for (const filePath of filesToProcess) {
      const fullPath = path.join(branchDir, filePath);

      try {
        const sourceCode = await fs.readFile(fullPath, "utf-8");

        await extractAndSaveDeclarations({
          context,
          filePath,
          sourceCode,
          workspaceDir: branchDir,
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
 * Track a file change for later declaration extraction.
 * Updates the version's changedFiles list.
 *
 * @param context - Workflow context
 * @param filePath - Relative path to the changed file
 * @param type - Type of change: added, modified, or deleted
 */
export async function trackFileChange({
  context,
  filePath,
  type,
}: {
  context: WorkflowContext;
  filePath: string;
  type: "added" | "modified" | "deleted";
}): Promise<void> {
  const branch = context.get("branch");

  await db
    .update(versions)
    .set({
      changedFiles: mergeJson(versions.changedFiles, [{ path: filePath, type }]),
    })
    .where(eq(versions.id, branch.headVersion.id));
}

/**
 * Handle file deletion - removes declarations associated with the deleted file.
 *
 * @param context - Workflow context
 * @param filePath - Relative path to the deleted file
 */
export async function handleFileDeleted({
  context,
  filePath,
}: {
  context: WorkflowContext;
  filePath: string;
}): Promise<void> {
  const { and, inArray } = await import("@weldr/db");
  const { declarations, versionDeclarations } = await import("@weldr/db/schema");

  const branch = context.get("branch");

  const logger = Logger.get({
    projectId: context.get("project").id,
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
