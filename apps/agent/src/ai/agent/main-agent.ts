/**
 * Main Agent
 *
 * The primary AI agent that handles user chat requests.
 * Streams responses to the UI and manages tool execution.
 */

import { type AssistantContent, type ModelMessage, type ToolSet } from "ai";

import type { Logger } from "@weldr/shared/logger";

import { getOrCreateWorkspace } from "@/core/workspace/just-bash";
import { getMessages, insertMessages } from "../messages";
import { agentPrompt } from "../prompts";
import { registry } from "../providers";
import {
  addIntegrationsTool,
  doneTool,
  queryRelatedDeclarationsTool,
  searchCodebaseTool,
  spawnAgentsTool,
} from "../tools";
import { runAgentLoop } from "./agent-loop";
import { finalizeSession } from "./finalize";
import type { ChatContext } from "./types";

// =============================================================================
// Types
// =============================================================================

export type MainAgentInput = {
  context: ChatContext;
  messages: ModelMessage[];
  logger: ReturnType<typeof Logger.get>;
  chatId: string;
  userId: string;
};

export type MainAgentResult = {
  isDone: boolean;
  awaitingUserInput: boolean;
  commitHash: string | null;
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Convert AI SDK response message to the format expected by insertMessages.
 */
function convertResponseMessage(msg: {
  role: string;
  content: unknown;
  id?: string;
}): { role: "assistant"; content: AssistantContent; id?: string } | null {
  if (msg.role !== "assistant") {
    return null;
  }

  return {
    role: "assistant" as const,
    content: msg.content as AssistantContent,
    id: msg.id,
  };
}

/**
 * Build the tool set for the main agent.
 */
async function buildToolSet(context: ChatContext): Promise<ToolSet> {
  const snapshotId = context.branch.snapshot?.id;

  if (!snapshotId) {
    throw new Error("Branch has no snapshot");
  }

  const { tools: bashTools } = await getOrCreateWorkspace({
    snapshotId,
    projectId: context.project.id,
  });

  return {
    ...bashTools.tools,
    searchCodebase: searchCodebaseTool(context),
    queryRelatedDeclarations: queryRelatedDeclarationsTool(context),
    spawnAgents: spawnAgentsTool(context),
    addIntegrations: addIntegrationsTool(context),
    done: doneTool(context),
  } as unknown as ToolSet;
}

// =============================================================================
// Main Agent
// =============================================================================

/**
 * Run the main agent to handle a user chat request.
 * Streams responses to the UI and manages the agentic loop.
 */
export async function runMainAgent(input: MainAgentInput): Promise<MainAgentResult> {
  const { context, messages, logger, chatId, userId } = input;

  if (!context.writer) {
    throw new Error("Writer not found");
  }

  // Send initial status
  context.writer.write({
    type: "data-status",
    data: { status: "thinking" },
    transient: true,
  });

  // Build tools and system prompt
  const [tools, systemPrompt] = await Promise.all([
    buildToolSet(context),
    agentPrompt(context.project),
  ]);

  // Run the agent loop
  const result = await runAgentLoop({
    model: registry.languageModel(context.modelId),
    system: systemPrompt,
    tools,
    initialMessages: messages,
    writer: context.writer,
    logger,
    stopWhen: (name, _input, toolResult) => {
      if (name === "done") return true;
      if (name === "addIntegrations") {
        const typedResult = toolResult as { status?: string } | undefined;
        if (typedResult?.status === "awaiting_config") return true;
      }
      return false;
    },
    onMessage: async (msg) => {
      const convertedMessage = convertResponseMessage(msg);
      if (convertedMessage) {
        try {
          await insertMessages({
            input: {
              chatId,
              userId,
              messages: [convertedMessage],
            },
          });
        } catch (error) {
          logger.error("Failed to save assistant message", {
            extra: { error: error instanceof Error ? error.message : String(error) },
          });
        }
      }
    },
    reloadMessages: () => getMessages(chatId),
  });

  // Determine what stopped the loop
  const isDone = result.stoppedByTool?.name === "done";
  const awaitingUserInput =
    result.stoppedByTool?.name === "addIntegrations" &&
    (result.stoppedByTool?.result as { status?: string } | undefined)?.status === "awaiting_config";

  let commitHash: string | null = null;

  // Only finalize if done (not if awaiting user input)
  if (isDone) {
    context.writer.write({
      type: "data-status",
      data: { status: "finalizing" },
      transient: true,
    });

    try {
      const finalizeResult = await finalizeSession(context);
      commitHash = finalizeResult.commitHash;

      if (commitHash) {
        context.writer.write({
          type: "data-branch-update",
          data: { commitSha: commitHash },
        });
      }

      logger.info("Session finalized", { extra: { commitHash } });
    } catch (error) {
      logger.error("Finalization failed", {
        extra: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  } else if (awaitingUserInput) {
    logger.info("Pausing for user input");
    context.writer.write({
      type: "data-status",
      data: { status: "awaiting_input" },
      transient: true,
    });
  }

  // Clear status
  context.writer.write({
    type: "data-status",
    data: { status: "idle" },
    transient: true,
  });

  return { isDone, awaitingUserInput, commitHash };
}
