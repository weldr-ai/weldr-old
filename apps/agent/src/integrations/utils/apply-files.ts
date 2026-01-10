import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Handlebars from "handlebars";

import { Logger } from "@weldr/shared/logger";
import { getBranchDir } from "@weldr/shared/state";
import type { Integration } from "@weldr/shared/types";

import { applyEdit } from "@/ai/utils/apply-edit";
import type { FileItem } from "@/integrations/types";
import { integrationRegistry } from "@/integrations/utils/registry";
import type { SessionContext } from "@/session";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function applyFiles({
  integration,
  context,
}: {
  integration: Integration;
  context: SessionContext;
}): Promise<void> {
  const project = context.project;
  const branch = context.branch;
  const branchDir = getBranchDir(project.id, branch.id);

  const files = await generateFiles({
    integration,
    context,
    branchDir,
  });

  const logger = Logger.get({ projectId: integration.projectId });

  logger.info(`Generated ${files.length} files for integration ${integration.key}`);

  for (const file of files) {
    logger.info(`Processing file: ${file.sourcePath} -> ${file.targetPath}`);
    const targetDir = path.dirname(file.targetPath);
    const fullTargetDir = path.resolve(branchDir, targetDir);

    try {
      await fs.mkdir(fullTargetDir, { recursive: true });
    } catch (error) {
      throw new Error("Failed to create directories for ${file.targetPath}", { cause: error });
    }

    try {
      switch (file.type) {
        case "copy": {
          const fullTargetPath = path.resolve(branchDir, file.targetPath);

          if (!fullTargetPath.startsWith(branchDir)) {
            throw new Error(`Invalid target path: path traversal detected`);
          }

          try {
            if (file.content.trim().length === 0) {
              await fs.writeFile(fullTargetPath, "", "utf-8");
            } else {
              await fs.writeFile(fullTargetPath, file.content, "utf-8");
            }
          } catch (error) {
            throw new Error("Failed to write content", { cause: error });
          }

          break;
        }
        case "llm_instruction": {
          const fullTargetPath = path.resolve(branchDir, file.targetPath);

          if (!fullTargetPath.startsWith(branchDir)) {
            throw new Error(`Invalid target path: path traversal detected`);
          }

          let originalContent: string;
          try {
            originalContent = await fs.readFile(fullTargetPath, "utf-8");
          } catch (error) {
            logger.error("Failed to read target file", {
              extra: { targetPath: file.targetPath },
            });
            throw new Error("Failed to read target file", { cause: error });
          }

          const updatedContent = await applyEdit({
            originalCode: originalContent,
            editInstructions: file.content,
          });

          try {
            await fs.writeFile(fullTargetPath, updatedContent, "utf-8");
          } catch (error) {
            throw new Error("Failed to write updated content", { cause: error });
          }

          break;
        }
        case "handlebars": {
          const fullTargetPath = path.resolve(branchDir, file.targetPath);

          if (!fullTargetPath.startsWith(branchDir)) {
            throw new Error(`Invalid target path: path traversal detected`);
          }

          const template = Handlebars.compile(file.template);

          const integrationVariables = integration.environmentVariableMappings.reduce(
            (acc, mapping) => {
              acc[mapping.mapTo] = mapping.environmentVariable.key;
              return acc;
            },
            {} as Record<string, string>,
          );

          const compiledContent = template(integrationVariables);

          try {
            await fs.writeFile(fullTargetPath, compiledContent, "utf-8");
          } catch (error) {
            throw new Error("Failed to write processed handlebars content", { cause: error });
          }

          break;
        }
      }
    } catch (error) {
      logger.error(`Failed to process file ${file.sourcePath}:`, {
        extra: { error },
      });
      throw error;
    }
  }
}

async function generateFiles({
  integration,
  context,
  branchDir,
}: {
  integration: Integration;
  context: SessionContext;
  branchDir: string;
}): Promise<FileItem[]> {
  const project = context.project;

  const category = integrationRegistry.getIntegrationCategory(integration.key);

  const hasAnyIntegration = project.integrationCategories.size > 0;

  // Consider both what's installed AND the current integration's category
  const hasFrontend = project.integrationCategories.has("frontend") || category.key === "frontend";
  const hasBackend = project.integrationCategories.has("backend") || category.key === "backend";

  const logger = Logger.get({ projectId: integration.projectId });

  logger.info(
    `Generating files for ${integration.key}: hasFrontend=${hasFrontend}, hasBackend=${hasBackend}, hasAnyIntegration=${hasAnyIntegration}`,
  );
  logger.info(
    `Integration categories: ${Array.from(project.integrationCategories).join(", ")}, current category: ${category.key}`,
  );

  let baseDataDir = path.join(
    path.resolve(__dirname, "../.."),
    `integrations/${category.key}/${integration.key}`,
  );

  if (
    integration.key === "postgresql" &&
    integration.options &&
    typeof integration.options === "object" &&
    "orm" in integration.options &&
    typeof integration.options.orm === "string"
  ) {
    baseDataDir = path.join(baseDataDir, integration.options.orm);
  }

  baseDataDir = path.join(baseDataDir, "data");

  try {
    await fs.access(baseDataDir);
  } catch {
    logger.error(`No data directory found for ${baseDataDir}`);
    throw new Error(`No data directory found for ${baseDataDir}`);
  }

  const files: FileItem[] = [];

  // ALWAYS copy base files first when no integrations have been installed yet
  if (!hasAnyIntegration) {
    logger.info("No existing integrations found, copying base files first");
    const baseFiles = await processBaseFiles(branchDir);
    files.push(...baseFiles);
  }

  if (hasBackend || !hasAnyIntegration) {
    const serverPath = path.join(baseDataDir, "server");
    logger.info(`Processing server files from ${serverPath} for ${integration.key}`);
    const serverFiles = await processDirectoryFiles(serverPath, "server", branchDir);
    logger.info(`Found ${serverFiles.length} server files for ${integration.key}`);
    files.push(...serverFiles);
  }

  if (hasFrontend || !hasAnyIntegration) {
    const webPath = path.join(baseDataDir, "web");
    const webFiles = await processDirectoryFiles(webPath, "web", branchDir);
    files.push(...webFiles);
  }

  return files;
}

async function processDirectoryFiles(
  sourcePath: string,
  target: "server" | "web",
  workspaceDir: string,
): Promise<FileItem[]> {
  const files: FileItem[] = [];

  async function walkDir(dir: string): Promise<string[]> {
    const results: string[] = [];
    try {
      const list = await fs.readdir(dir, { withFileTypes: true });
      for (const item of list) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          const subResults = await walkDir(fullPath);
          results.push(...subResults);
        } else if (item.isFile()) {
          results.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
    return results;
  }

  const filePaths = await walkDir(sourcePath);

  for (const filePath of filePaths) {
    if (typeof filePath !== "string") continue;

    const relativePath = filePath.replace(`${sourcePath}/`, "");
    const targetPath = path.join(workspaceDir, "apps", target, relativePath);

    const file = await processFile(filePath, targetPath);
    files.push(...file);
  }

  return files;
}

async function processFile(filePath: string, targetPath: string): Promise<FileItem[]> {
  const files: FileItem[] = [];

  let type: FileItem["type"];

  if (filePath.endsWith(".txt")) {
    type = "llm_instruction";
  } else if (filePath.endsWith(".hbs")) {
    type = "handlebars";
  } else {
    type = "copy";
  }

  // Read the file content
  let fileContent: string;
  try {
    fileContent = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    Logger.error("Failed to read file", {
      extra: { filePath },
    });
    throw new Error("Failed to read file", { cause: error });
  }

  const targetPathWithoutExtension = targetPath.replace(/\.(txt|hbs)$/, "");

  if (type === "handlebars") {
    const template = fileContent;
    files.push({
      type,
      sourcePath: filePath,
      targetPath: targetPathWithoutExtension,
      template,
    });
  } else {
    files.push({
      type,
      sourcePath: filePath,
      targetPath: targetPathWithoutExtension,
      content: fileContent,
    });
  }

  return files;
}

async function processBaseFiles(workspaceDir: string): Promise<FileItem[]> {
  const baseDir = path.resolve(__dirname, "../base");

  try {
    await fs.access(baseDir);
  } catch {
    Logger.error(`No base directory found at ${baseDir}`);
    throw new Error(`No base directory found at ${baseDir}`);
  }

  const files: FileItem[] = [];

  const baseFiles = [".gitignore", ".npmrc", "biome.json", "package.json", "turbo.json"];

  for (const fileName of baseFiles) {
    const sourcePath = path.join(baseDir, fileName);
    const targetPath = path.join(workspaceDir, fileName);

    const file = await processFile(sourcePath, targetPath);
    files.push(...file);
  }

  return files;
}
