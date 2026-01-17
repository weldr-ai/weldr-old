import type { ToolContent, ToolResultPart } from "ai";

import { and, db, eq } from "@weldr/db";
import { chatMessages, integrationInstallations } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";
import type {
  IntegrationCategoryKey,
  IntegrationInstallationStatus,
  IntegrationKey,
  ToolMessage,
} from "@weldr/shared/types";

import { stream } from "@/core/stream";
import type { SessionContext } from "@/session";
import {
  getQueuedIntegrations,
  unblockIntegrations,
  updateIntegrationInstallationStatus,
} from "./queue-manager";
import { integrationRegistry } from "./registry";

async function streamToolMessageUpdate({
  context,
  integrationKey,
  status,
}: {
  context: SessionContext;
  integrationKey: IntegrationKey;
  status: IntegrationInstallationStatus;
}) {
  const chatId = context.chatId;

  // Skip streaming if no chatId is available
  if (!chatId) {
    return;
  }

  const message = await db.query.chatMessages.findFirst({
    where: and(eq(chatMessages.chatId, chatId), eq(chatMessages.role, "tool")),
    orderBy: (chatMessages, { desc }) => [desc(chatMessages.createdAt)],
  });

  if (!message) {
    return;
  }

  const toolMessage = message as ToolMessage;

  const toolResultPart = toolMessage.content[0] as ToolResultPart;

  const toolOutput = toolResultPart.output as {
    type: "json";
    value: {
      status: "awaiting_config" | "success" | "cancelled" | "failed";
      categories: IntegrationCategoryKey[];
      integrations?: {
        category: IntegrationCategoryKey;
        key: IntegrationKey;
        name: string;
        status: IntegrationInstallationStatus;
      }[];
    };
  };

  const updatedIntegrations = toolOutput.value.integrations?.map(
    (existingIntegration: {
      category: IntegrationCategoryKey;
      key: IntegrationKey;
      name: string;
      status: IntegrationInstallationStatus;
    }) =>
      existingIntegration.key === integrationKey
        ? { ...existingIntegration, status }
        : existingIntegration,
  );

  const updatedContent = [
    {
      type: "tool-result",
      toolCallId: toolResultPart.toolCallId,
      toolName: toolResultPart.toolName,
      output: {
        type: "json",
        value: {
          status: "completed",
          categories: toolOutput.value.categories,
          integrations: updatedIntegrations,
        },
      },
    },
  ] as ToolContent;

  await db
    .update(chatMessages)
    .set({
      content: updatedContent,
    })
    .where(eq(chatMessages.id, message.id));

  await stream(chatId, {
    type: "tool",
    message: {
      ...toolMessage,
      content: updatedContent,
    },
  });
}

export async function installQueuedIntegrations(context: SessionContext): Promise<
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

        await streamToolMessageUpdate({
          context,
          integrationKey: integration.key,
          status: "installing",
        });

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

        await streamToolMessageUpdate({
          context,
          integrationKey: integration.key,
          status: "installed",
        });
      } catch (error) {
        logger.error(`Failed to install ${integration.key}`, {
          extra: { error },
        });

        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        await updateIntegrationInstallationStatus(snapshotId, integration.id, "failed");

        await streamToolMessageUpdate({
          context,
          integrationKey: integration.key,
          status: "failed",
        });

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
