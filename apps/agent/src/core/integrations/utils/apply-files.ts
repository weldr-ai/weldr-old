import { promises as nodeFs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Handlebars from "handlebars";

import { Logger } from "@weldr/shared/logger";
import type { Integration, IntegrationCategoryKey } from "@weldr/shared/types";

import type { ChatContext } from "@/ai/agent/types";
import { applyEdit } from "@/ai/utils/apply-edit";
import { getOrCreateWorkspace } from "@/core/workspace/just-bash/session";
import type { FileItem } from "../types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function applyFiles({
  integration,
  context,
  categoryKey,
}: {
  integration: Integration;
  context: ChatContext;
  categoryKey: IntegrationCategoryKey;
}): Promise<void> {
  const branch = context.branch;
  const snapshotId = branch.snapshot?.id;

  const logger = Logger.get({ projectId: integration.projectId });

  if (!snapshotId) {
    logger.warn("Cannot apply files: branch has no snapshot");
    return;
  }

  const files = await generateFiles({
    integration,
    context,
    categoryKey,
  });

  logger.info(`Generated ${files.length} files for integration ${integration.key}`);

  const session = await getOrCreateWorkspace({
    projectId: integration.projectId,
    snapshotId,
  });

  for (const file of files) {
    logger.info(`Processing file: ${file.sourcePath} -> ${file.targetPath}`);

    try {
      switch (file.type) {
        case "copy": {
          const content = file.content.trim().length === 0 ? "" : file.content;
          await session.agent.fs.writeFile(file.targetPath, content);
          break;
        }
        case "llm_instruction": {
          let originalContent = "";
          try {
            originalContent = await session.agent.fs.readFile(file.targetPath, "utf-8");
          } catch {
            logger.error("Failed to read target file", {
              extra: { targetPath: file.targetPath },
            });
          }

          const updatedContent = await applyEdit({
            originalCode: originalContent,
            editInstructions: file.content,
          });

          await session.agent.fs.writeFile(file.targetPath, updatedContent);
          break;
        }
        case "handlebars": {
          const template = Handlebars.compile(file.template);

          const integrationVariables = integration.environmentVariableMappings.reduce(
            (acc, mapping) => {
              acc[mapping.mapTo] = mapping.environmentVariable.key;
              return acc;
            },
            {} as Record<string, string>,
          );

          const compiledContent = template(integrationVariables);

          await session.agent.fs.writeFile(file.targetPath, compiledContent);
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
  categoryKey,
}: {
  integration: Integration;
  context: ChatContext;
  categoryKey: IntegrationCategoryKey;
}): Promise<FileItem[]> {
  const project = context.project;

  const hasAnyIntegration = project.integrationCategories.size > 0;

  const hasFrontend = project.integrationCategories.has("frontend") || categoryKey === "frontend";
  const hasBackend = project.integrationCategories.has("backend") || categoryKey === "backend";

  const logger = Logger.get({ projectId: integration.projectId });

  logger.info(
    `Generating files for ${integration.key}: hasFrontend=${hasFrontend}, hasBackend=${hasBackend}, hasAnyIntegration=${hasAnyIntegration}`,
  );
  logger.info(
    `Integration categories: ${Array.from(project.integrationCategories).join(", ")}, current category: ${categoryKey}`,
  );

  let baseDataDir = path.join(
    path.resolve(__dirname, "../.."),
    `integrations/${categoryKey}/${integration.key}`,
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
    await nodeFs.access(baseDataDir);
  } catch {
    logger.error(`No data directory found for ${baseDataDir}`);
    throw new Error(`No data directory found for ${baseDataDir}`);
  }

  const files: FileItem[] = [];

  if (!hasAnyIntegration) {
    logger.info("No existing integrations found, copying base files first");
    const baseFiles = await processBaseFiles();
    files.push(...baseFiles);
  }

  if (hasBackend || !hasAnyIntegration) {
    const serverPath = path.join(baseDataDir, "server");
    logger.info(`Processing server files from ${serverPath} for ${integration.key}`);
    const serverFiles = await processDirectoryFiles(serverPath, "server");
    logger.info(`Found ${serverFiles.length} server files for ${integration.key}`);
    files.push(...serverFiles);
  }

  if (hasFrontend || !hasAnyIntegration) {
    const webPath = path.join(baseDataDir, "web");
    const webFiles = await processDirectoryFiles(webPath, "web");
    files.push(...webFiles);
  }

  return files;
}

async function processDirectoryFiles(
  sourcePath: string,
  target: "server" | "web",
): Promise<FileItem[]> {
  const files: FileItem[] = [];

  async function walkDir(dir: string): Promise<string[]> {
    const results: string[] = [];
    try {
      const list = await nodeFs.readdir(dir, { withFileTypes: true });
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
    const targetPath = `/apps/${target}/${relativePath}`;

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

  let fileContent: string;
  try {
    fileContent = await nodeFs.readFile(filePath, "utf-8");
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

async function processBaseFiles(): Promise<FileItem[]> {
  const baseDir = path.resolve(__dirname, "../base");

  try {
    await nodeFs.access(baseDir);
  } catch {
    Logger.error(`No base directory found at ${baseDir}`);
    throw new Error(`No base directory found at ${baseDir}`);
  }

  const files: FileItem[] = [];

  const baseFiles = [".gitignore", ".npmrc", "biome.json", "package.json", "turbo.json"];

  for (const fileName of baseFiles) {
    const sourcePath = path.join(baseDir, fileName);
    const targetPath = `/${fileName}`;

    const file = await processFile(sourcePath, targetPath);
    files.push(...file);
  }

  return files;
}
