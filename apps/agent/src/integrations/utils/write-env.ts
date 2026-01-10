/**
 * Utility for writing environment variables to .env files in local mode
 *
 * When integrations are installed in local mode, this utility:
 * 1. Resolves environment variable values from the database (including secrets)
 * 2. Determines which app targets (server/web) need the variables based on package targets
 * 3. Writes variables to apps/server/.env or apps/web/.env
 * 4. Skips variables that already exist in the .env file
 *
 * This only runs in local mode. In cloud mode, environment variables are set
 * on the Fly.io machine directly.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { db, eq } from "@weldr/db";
import { secrets } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";
import { getBranchDir } from "@weldr/shared/state";
import type { Integration } from "@weldr/shared/types";

import type { SessionContext } from "@/session";

/**
 * Parse a .env file content into a Map
 */
function parseEnvFile(content: string): Map<string, string> {
  const envMap = new Map<string, string>();
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Parse KEY=VALUE format
    const equalIndex = trimmed.indexOf("=");
    if (equalIndex > 0) {
      const key = trimmed.slice(0, equalIndex).trim();
      envMap.set(key, trimmed);
    }
  }

  return envMap;
}

/**
 * Write environment variables to .env file for a specific target (server or web)
 */
async function writeEnvToTarget({
  branchDir,
  target,
  envVars,
}: {
  branchDir: string;
  target: "server" | "web";
  envVars: Array<{ key: string; value: string }>;
}): Promise<void> {
  const envFilePath = path.join(branchDir, "apps", target, ".env");

  Logger.info(`Writing ${envVars.length} environment variables to ${target}/.env`);

  let existingContent = "";
  let existingEnvMap = new Map<string, string>();

  // Read existing .env file if it exists
  try {
    existingContent = await fs.readFile(envFilePath, "utf-8");
    existingEnvMap = parseEnvFile(existingContent);
  } catch {
    // File doesn't exist, that's ok
    Logger.info(`.env file doesn't exist at ${envFilePath}, will create new one`);
  }

  // Prepare new environment variables to add
  const newLines: string[] = [];
  let addedCount = 0;
  let skippedCount = 0;

  for (const { key, value } of envVars) {
    if (existingEnvMap.has(key)) {
      Logger.info(`Skipping ${key} - already exists in ${target}/.env`);
      skippedCount++;
    } else {
      newLines.push(`${key}=${value}`);
      addedCount++;
    }
  }

  // If there are new variables to add, append them to the file
  if (newLines.length > 0) {
    let finalContent = existingContent;

    // Add a newline if the file doesn't end with one
    if (finalContent && !finalContent.endsWith("\n")) {
      finalContent += "\n";
    }

    // Add a separator comment if the file has existing content
    if (finalContent) {
      finalContent += "\n# Added by integration installation\n";
    }

    finalContent += newLines.join("\n") + "\n";

    // Ensure the directory exists
    await fs.mkdir(path.dirname(envFilePath), { recursive: true });

    // Write the updated content
    await fs.writeFile(envFilePath, finalContent, "utf-8");

    Logger.info(
      `Added ${addedCount} environment variables to ${target}/.env (${skippedCount} skipped)`,
    );
  } else {
    Logger.info(
      `No new environment variables to add to ${target}/.env (${skippedCount} already exist)`,
    );
  }
}

/**
 * Get environment variable values from the database (resolving secrets)
 */
async function getEnvironmentVariableValues(
  integration: Integration,
): Promise<Array<{ key: string; value: string }>> {
  const envVarValues: Array<{ key: string; value: string }> = [];

  for (const mapping of integration.environmentVariableMappings) {
    const envVar = mapping.environmentVariable;

    // Fetch the secret value
    const secret = await db.query.secrets.findFirst({
      where: eq(secrets.id, envVar.secretId),
    });

    if (secret) {
      envVarValues.push({
        key: envVar.key,
        value: secret.secret,
      });
    }
  }

  return envVarValues;
}

/**
 * Get the integration definition from registry to access variables config
 */
async function getIntegrationDefinition(integration: Integration) {
  const { integrationRegistry } = await import("./registry");
  return integrationRegistry.getIntegration(integration.key);
}

/**
 * Write environment variables to appropriate .env files in local mode
 * Writes to apps/server/.env and/or apps/web/.env based on the integration's variables target config
 */
export async function writeEnvironmentVariables({
  context,
  integration,
}: {
  context: SessionContext;
  integration: Integration;
}): Promise<void> {
  const project = context.project;
  const branch = context.branch;
  const logger = Logger.get({ projectId: project.id });

  // Check if integration has environment variables
  if (
    !integration.environmentVariableMappings ||
    integration.environmentVariableMappings.length === 0
  ) {
    logger.info("No environment variables to write");
    return;
  }

  const branchDir = getBranchDir(project.id, branch.id);

  // Get environment variable values
  const envVarValues = await getEnvironmentVariableValues(integration);

  if (envVarValues.length === 0) {
    logger.warn("No environment variable values found");
    return;
  }

  // Get integration definition to access variables config
  const integrationDef = await getIntegrationDefinition(integration);

  if (!integrationDef || !integrationDef.variables) {
    logger.warn("No variables config found in integration definition");
    return;
  }

  // Determine which targets need env vars based on variables config
  const targetsSet = new Set<"server" | "web">();

  for (const variable of integrationDef.variables) {
    for (const target of variable.target) {
      targetsSet.add(target);
    }
  }

  const targets = Array.from(targetsSet);

  if (targets.length === 0) {
    logger.warn("No valid targets found in variables config, defaulting to server");
    targets.push("server");
  }

  // Write environment variables to each target
  for (const target of targets) {
    try {
      await writeEnvToTarget({
        branchDir,
        target,
        envVars: envVarValues,
      });
    } catch (error) {
      logger.error(`Failed to write environment variables to ${target}/.env`, {
        extra: { error },
      });
      throw error;
    }
  }
}
