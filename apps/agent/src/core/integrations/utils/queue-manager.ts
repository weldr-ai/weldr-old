import { and, db, eq } from "@weldr/db";
import { integrationInstallations } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";
import type { Integration, IntegrationInstallationStatus } from "@weldr/shared/types";

import type { SessionContext } from "@/session";
import { integrationRegistry } from "./registry";

export async function processIntegrationQueue(context: SessionContext): Promise<void> {
  const project = context.project;
  const branch = context.branch;
  const versionId = branch.headVersionId;
  const logger = Logger.get({ projectId: project.id });

  if (!versionId) {
    logger.error("No head version found for branch");
    throw new Error("No head version found for branch");
  }

  logger.info("Processing integration queue");

  const queuedInstallations = await db.query.integrationInstallations.findMany({
    where: and(
      eq(integrationInstallations.versionId, versionId),
      eq(integrationInstallations.status, "queued"),
    ),
    with: {
      integration: true,
    },
  });

  if (queuedInstallations.length === 0) {
    logger.info("No queued integrations to process");
    return;
  }

  // Fetch environment variable mappings separately to avoid deep nesting
  const integrationIds = queuedInstallations.map((i) => i.integration.id);
  const envMappings =
    integrationIds.length > 0
      ? await db.query.integrationEnvironmentVariables.findMany({
          where: (fields, { inArray }) => inArray(fields.integrationId, integrationIds),
          with: {
            environmentVariable: true,
          },
        })
      : [];

  // Map environment variables to integrations
  const envMappingsByIntegration = new Map<string, typeof envMappings>();
  for (const mapping of envMappings) {
    const existing = envMappingsByIntegration.get(mapping.integrationId);
    if (existing) {
      existing.push(mapping);
    } else {
      envMappingsByIntegration.set(mapping.integrationId, [mapping]);
    }
  }

  // Attach environment mappings to integrations
  for (const installation of queuedInstallations) {
    const mappings = envMappingsByIntegration.get(installation.integration.id) || [];
    Object.assign(installation.integration, {
      environmentVariableMappings: mappings,
    });
  }

  // Get completed installations for this version
  const completedInstallations = await db.query.integrationInstallations.findMany({
    where: and(
      eq(integrationInstallations.versionId, versionId),
      eq(integrationInstallations.status, "installed"),
    ),
    with: {
      integration: true,
    },
  });

  const completedCategories = completedInstallations
    .map((iv) => integrationRegistry.getIntegration(iv.integration.key)?.category)
    .filter(Boolean);

  for (const installRecord of queuedInstallations) {
    const integration = installRecord.integration;
    const category = integrationRegistry.getIntegrationCategory(integration.key);
    if (!category) {
      logger.error(`Integration definition not found: ${integration.key}`);
      throw new Error(`Integration definition not found: ${integration.key}`);
    }
    const dependencies = category.dependencies || [];
    const missingDependencies = dependencies.filter((dep) => !completedCategories.includes(dep));

    if (missingDependencies.length > 0) {
      await db
        .update(integrationInstallations)
        .set({ status: "blocked" })
        .where(eq(integrationInstallations.id, installRecord.id));

      logger.info(`Blocked ${integration.key} - missing: ${missingDependencies.join(", ")}`);
    }
  }

  logger.info("Queue processing completed");
}

export async function unblockIntegrations(context: SessionContext): Promise<void> {
  const project = context.project;
  const branch = context.branch;
  const versionId = branch.headVersionId;
  const logger = Logger.get({ projectId: project.id });

  if (!versionId) {
    logger.error("No head version found for branch");
    return;
  }

  const blockedInstallations = await db.query.integrationInstallations.findMany({
    where: and(
      eq(integrationInstallations.versionId, versionId),
      eq(integrationInstallations.status, "blocked"),
    ),
    with: {
      integration: true,
    },
  });

  if (blockedInstallations.length === 0) {
    return;
  }

  const completedInstallations = await db.query.integrationInstallations.findMany({
    where: and(
      eq(integrationInstallations.versionId, versionId),
      eq(integrationInstallations.status, "installed"),
    ),
    with: {
      integration: true,
    },
  });

  const completedCategories = completedInstallations
    .map((iv) => integrationRegistry.getIntegration(iv.integration.key)?.category)
    .filter(Boolean);

  for (const installRecord of blockedInstallations) {
    const integration = installRecord.integration;
    const category = integrationRegistry.getIntegrationCategory(integration.key);
    const dependencies = category.dependencies || [];
    const missingDependencies = dependencies.filter((dep) => !completedCategories.includes(dep));

    if (missingDependencies.length === 0) {
      await db
        .update(integrationInstallations)
        .set({ status: "queued" })
        .where(eq(integrationInstallations.id, installRecord.id));

      logger.info(`Unblocked ${integration.key} - dependencies now satisfied`);
    }
  }
}

export async function getQueuedIntegrations(context: SessionContext): Promise<Integration[]> {
  const branch = context.branch;
  const versionId = branch.headVersionId;

  if (!versionId) {
    throw new Error("No head version found for branch");
  }

  const queuedInstallations = await db.query.integrationInstallations.findMany({
    where: and(
      eq(integrationInstallations.versionId, versionId),
      eq(integrationInstallations.status, "queued"),
    ),
    with: {
      integration: true,
    },
  });

  // Fetch environment variable mappings separately to avoid deep nesting
  const integrationIds = queuedInstallations.map((i) => i.integration.id);
  const envMappings =
    integrationIds.length > 0
      ? await db.query.integrationEnvironmentVariables.findMany({
          where: (fields, { inArray }) => inArray(fields.integrationId, integrationIds),
          with: {
            environmentVariable: true,
          },
        })
      : [];

  // Map environment variables to integrations
  const envMappingsByIntegration = new Map<string, typeof envMappings>();
  for (const mapping of envMappings) {
    const existing = envMappingsByIntegration.get(mapping.integrationId);
    if (existing) {
      existing.push(mapping);
    } else {
      envMappingsByIntegration.set(mapping.integrationId, [mapping]);
    }
  }

  // Attach environment mappings to integrations and extract them
  const queuedIntegrations = queuedInstallations.map((installation) => {
    const mappings = envMappingsByIntegration.get(installation.integration.id) || [];
    return {
      ...installation.integration,
      environmentVariableMappings: mappings,
    } as Integration;
  });

  const integrationKeys = queuedIntegrations.map((i) => i.key);
  const orderedKeys = integrationRegistry.getInstallationOrder(integrationKeys);

  return orderedKeys
    .map((key) => queuedIntegrations.find((i) => i.key === key))
    .filter(Boolean) as Integration[];
}

export async function updateIntegrationInstallationStatus(
  versionId: string,
  integrationId: string,
  status: IntegrationInstallationStatus,
): Promise<void> {
  await db
    .update(integrationInstallations)
    .set({
      status,
      ...(status === "installed" ? { installedAt: new Date() } : {}),
    })
    .where(
      and(
        eq(integrationInstallations.versionId, versionId),
        eq(integrationInstallations.integrationId, integrationId),
      ),
    );
}
