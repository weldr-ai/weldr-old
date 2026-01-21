import { and, db, eq } from "@weldr/db";
import { integrationInstallations } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";
import type { IntegrationInstallationStatus, IntegrationKey } from "@weldr/shared/types";

import type { ChatContext } from "@/ai/agent/types";
import {
  getQueuedIntegrations,
  unblockIntegrations,
  updateIntegrationInstallationStatus,
} from "./queue-manager";
import { integrationRegistry } from "./registry";

export async function installQueuedIntegrations(context: ChatContext): Promise<
  | {
      status: "completed";
      installedIntegrations: {
        id: string;
        key: IntegrationKey;
        status: IntegrationInstallationStatus;
      }[];
    }
  | {
      status: "error";
      error: string;
    }
> {
  const project = context.project;
  const branch = context.branch;
  const snapshotId = branch.snapshot?.id;
  const logger = Logger.get({ projectId: project.id });

  if (!snapshotId) {
    return {
      status: "error",
      error: "No snapshot found for branch",
    };
  }

  logger.info("Starting installation of queued integrations");

  const allInstalledIntegrations: {
    id: string;
    key: IntegrationKey;
    status: IntegrationInstallationStatus;
  }[] = [];

  let installationRound = 1;

  while (true) {
    const queuedIntegrations = await getQueuedIntegrations(context);

    if (queuedIntegrations.length === 0) {
      logger.info(`Installation round ${installationRound}: No queued integrations found`);
      break;
    }

    logger.info(
      `Installation round ${installationRound}: Found ${queuedIntegrations.length} queued integrations`,
    );

    let installedInThisRound = 0;

    for (const integration of queuedIntegrations) {
      try {
        await updateIntegrationInstallationStatus(snapshotId, integration.id, "installing");
        logger.info(`Started installing ${integration.key}`);

        await integrationRegistry.install({
          integration,
          context,
        });

        await updateIntegrationInstallationStatus(snapshotId, integration.id, "installed");
        logger.info(`Successfully installed ${integration.key}`);

        allInstalledIntegrations.push({
          id: integration.id,
          key: integration.key,
          status: "installed",
        });

        installedInThisRound++;
      } catch (error) {
        logger.error(`Failed to install ${integration.key}`, {
          extra: { error },
        });

        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        await updateIntegrationInstallationStatus(snapshotId, integration.id, "failed");

        const fullError = `Failed to install ${integration.key}: ${errorMessage}`;
        return {
          status: "error",
          error: fullError,
        };
      }
    }

    logger.info(
      `Installation round ${installationRound}: Installed ${installedInThisRound} integrations`,
    );

    if (installedInThisRound === 0) {
      logger.info("No integrations installed in this round, stopping");
      break;
    }

    await unblockIntegrations(context);

    installationRound++;
  }

  const blockedIntegrations = await db.query.integrationInstallations.findMany({
    where: and(
      eq(integrationInstallations.snapshotId, snapshotId),
      eq(integrationInstallations.status, "blocked"),
    ),
    with: {
      integration: true,
    },
  });

  if (blockedIntegrations.length > 0) {
    const blockedKeys = blockedIntegrations.map((i) => i.integration.key).join(", ");
    logger.warn(
      `Installation completed but ${blockedIntegrations.length} integrations remain blocked: ${blockedKeys}`,
    );
  }

  logger.info(
    `Successfully installed ${allInstalledIntegrations.length} integrations across ${installationRound - 1} rounds`,
  );

  return {
    status: "completed",
    installedIntegrations: allInstalledIntegrations,
  };
}
