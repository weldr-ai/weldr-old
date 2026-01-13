import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Logger } from "@weldr/shared/logger";
import type { DeclarationCodeMetadata } from "@weldr/shared/types/declarations";

import { enrichDeclaration } from "@/core/project/declarations/enrich";
import { extractDeclarations } from "@/core/project/declarations/extractor";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = Logger.get({ module: "generate-enriched-declarations" });

interface EnrichedDeclaration {
  codeMetadata: DeclarationCodeMetadata;
  semanticData: Awaited<ReturnType<typeof enrichDeclaration>>;
}

async function findTsFiles(dir: string): Promise<string[]> {
  const tsFiles: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (
        entry.name.endsWith(".d.ts") ||
        entry.name.endsWith(".gen.ts") ||
        entry.name.endsWith("vite.config.ts") ||
        entry.name.endsWith("tailwind.config.ts") ||
        entry.name.endsWith("tsdown.config.ts")
      ) {
        continue;
      }

      if (entry.isDirectory()) {
        tsFiles.push(...(await findTsFiles(fullPath)));
      } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
        tsFiles.push(fullPath);
      }
    }
  } catch (error: unknown) {
    logger.error(`Failed to read directory: ${dir}`, { error });
  }

  return tsFiles;
}

function getDataFolderPath(filePath: string): string | null {
  const dataIndex = filePath.lastIndexOf("/data/");
  if (dataIndex === -1) return null;
  return filePath.substring(0, dataIndex + 5); // Include "/data"
}

function createFileKey(filePath: string): string {
  // Extract everything after /data/
  const dataIndex = filePath.lastIndexOf("/data/");
  if (dataIndex === -1) return filePath;

  const afterData = filePath.substring(dataIndex + 6);

  // Check what app folder is in the data path
  if (afterData.startsWith("web/")) {
    // Web app files
    return `apps/web/${afterData.substring(4)}`;
  } else if (afterData.startsWith("server/")) {
    // Server app files
    return `apps/server/${afterData.substring(7)}`;
  }

  // Fallback: Check the integration type for hints
  if (filePath.includes("/frontend/tanstack-start/")) {
    return `apps/web/${afterData}`;
  } else if (filePath.includes("/agent/")) {
    return `apps/agent/${afterData}`;
  }

  // Default: try to detect from the file path itself
  return `apps/${afterData}`;
}

async function processFile(
  filePath: string,
  outputPath: string,
  existingDeclarations: Record<string, EnrichedDeclaration[]>,
): Promise<void> {
  logger.info(`Processing: ${filePath}`);

  try {
    const sourceCode = await fs.readFile(filePath, "utf-8");

    // Create the filename that will be used in URI generation
    // This should match the key we create (apps/web/src/lib/seo.ts)
    const uriFilename = createFileKey(filePath);

    const declarations = await extractDeclarations({
      sourceCode,
      filename: uriFilename, // Use the transformed filename for URI generation
      pathAliases: filePath.includes("/server/")
        ? { "@repo/server/*": "apps/server/src/*" }
        : filePath.includes("/web/")
          ? { "@repo/web/*": "apps/web/src/*" }
          : undefined,
      // No branchId - this is processing internal templates, not user workspace
    });

    if (declarations.length === 0) {
      logger.info(`  No declarations found`);
      return;
    }

    const key = createFileKey(filePath);
    const existingFileDeclarations = existingDeclarations[key] || [];

    // Create a set of existing declaration URIs for quick lookup
    const existingURIs = new Set(existingFileDeclarations.map((d) => d.codeMetadata.uri));

    let skippedCount = 0;
    let addedCount = 0;

    for (const declaration of declarations) {
      // Check if this declaration already exists in the output
      if (existingURIs.has(declaration.uri)) {
        logger.info(`  Skipping existing: ${declaration.name} (${declaration.type})`);
        skippedCount++;
        continue;
      }

      logger.info(`  Enriching: ${declaration.name} (${declaration.type})`);
      try {
        const semanticData = await enrichDeclaration(
          declaration,
          uriFilename, // Use the transformed filename for consistency
          sourceCode,
        );

        const enrichedDeclaration = {
          codeMetadata: declaration,
          semanticData,
        };

        // Add to existing declarations and write immediately
        if (!existingDeclarations[key]) {
          existingDeclarations[key] = [];
        }
        existingDeclarations[key].push(enrichedDeclaration);
        existingURIs.add(declaration.uri);
        addedCount++;

        // Write to file immediately
        await fs.writeFile(outputPath, JSON.stringify(existingDeclarations, null, 2), "utf-8");

        logger.info(`  Added ${declaration.name} and updated ${outputPath}`);
      } catch (error) {
        logger.error(`  Failed to enrich ${declaration.name}: ${error}`);

        const failedDeclaration = {
          codeMetadata: declaration,
          semanticData: null,
        };

        // Add failed declaration and write immediately
        if (!existingDeclarations[key]) {
          existingDeclarations[key] = [];
        }
        existingDeclarations[key].push(failedDeclaration);
        existingURIs.add(declaration.uri);
        addedCount++;

        // Write to file immediately
        await fs.writeFile(outputPath, JSON.stringify(existingDeclarations, null, 2), "utf-8");

        logger.info(`  Added ${declaration.name} (failed) and updated ${outputPath}`);
      }
    }

    if (addedCount > 0) {
      logger.info(
        `  Completed ${key}: added ${addedCount} declarations (skipped ${skippedCount} existing)`,
      );
    } else if (skippedCount > 0) {
      logger.info(`  All ${skippedCount} declarations already exist for ${key}, skipping`);
    }
  } catch (error) {
    logger.error(`Failed to process ${filePath}: ${error}`);
  }
}

async function loadExistingDeclarations(
  outputPath: string,
): Promise<Record<string, EnrichedDeclaration[]>> {
  try {
    const existing = await fs.readFile(outputPath, "utf-8");
    return JSON.parse(existing);
  } catch {
    return {};
  }
}

export async function generateEnrichedDeclarations(targetPath?: string): Promise<void> {
  const baseDir = __dirname;

  // Check if a specific file was provided
  if (targetPath) {
    const absolutePath = path.isAbsolute(targetPath)
      ? targetPath
      : path.resolve(process.cwd(), targetPath);

    // Verify it's a TypeScript file in a data folder
    if (!absolutePath.includes("/data/")) {
      logger.error("File must be in a data/ folder");
      return;
    }

    if (!absolutePath.endsWith(".ts") || absolutePath.endsWith(".d.ts")) {
      logger.error("File must be a TypeScript file (not .d.ts)");
      return;
    }

    // Check file exists
    try {
      await fs.access(absolutePath);
    } catch {
      logger.error(`File not found: ${absolutePath}`);
      return;
    }

    logger.info(`Processing single file: ${absolutePath}`);

    // Get output path for this file's data folder
    const dataFolder = getDataFolderPath(absolutePath);
    if (!dataFolder) {
      logger.error(`Could not find data folder for ${absolutePath}`);
      return;
    }

    const outputPath = path.join(dataFolder, "declarations.json");
    const existingDeclarations = await loadExistingDeclarations(outputPath);

    await processFile(absolutePath, outputPath, existingDeclarations);
    logger.info(`Completed processing ${absolutePath}`);
  } else {
    // Process all files grouped by data folder
    logger.info(`Starting generation for all files in: ${baseDir}`);

    const tsFiles = await findTsFiles(baseDir);
    const dataFiles = tsFiles.filter((f) => f.includes("/data/"));

    logger.info(`Found ${dataFiles.length} TypeScript files in data folders`);

    if (dataFiles.length === 0) {
      logger.info("No TypeScript files found in data folders");
      return;
    }

    // Group files by their data folder
    const filesByDataFolder = new Map<string, string[]>();

    for (const filePath of dataFiles) {
      const dataFolder = getDataFolderPath(filePath);
      if (dataFolder) {
        if (!filesByDataFolder.has(dataFolder)) {
          filesByDataFolder.set(dataFolder, []);
        }
        const files = filesByDataFolder.get(dataFolder);
        if (files) {
          files.push(filePath);
        }
      }
    }

    logger.info(`Found ${filesByDataFolder.size} data folders to process`);

    // Process each data folder
    for (const [dataFolder, files] of filesByDataFolder) {
      logger.info(`Processing data folder: ${dataFolder}`);

      const outputPath = path.join(dataFolder, "declarations.json");
      const existingDeclarations = await loadExistingDeclarations(outputPath);

      for (const filePath of files) {
        await processFile(filePath, outputPath, existingDeclarations);
      }

      logger.info(`  Completed processing ${files.length} files in ${dataFolder}`);
    }
  }

  logger.info(`Completed processing`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const targetPath = process.argv[2];

  generateEnrichedDeclarations(targetPath)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Failed:", error);
      process.exit(1);
    });
}
