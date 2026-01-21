/**
 * Unified Agent Loop
 *
 * Core agentic loop used by both the main chat agent and sub-agents.
 * Always uses streamText for consistent behavior.
 */

import {
  streamText,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
  type UIMessageStreamWriter,
} from "ai";

import type { Logger } from "@weldr/shared/logger";

// =============================================================================
// Types
// =============================================================================

export type AgentLoopConfig = {
  // Required
  model: LanguageModel;
  system: string;
  tools: ToolSet;
  initialMessages: ModelMessage[];

  // Optional
  writer?: UIMessageStreamWriter;
  agentId?: string; // If set, streams as nested sub-agent with this ID
  logger?: ReturnType<typeof Logger.get>;

  // Callbacks
  stopWhen?: (toolName: string, input: unknown, result: unknown) => boolean;
  onMessage?: (message: { role: "assistant"; content: unknown }) => Promise<void>;
  reloadMessages?: () => Promise<ModelMessage[]>;
};

export type AgentLoopResult = {
  success: boolean;
  finishReason: string;
  toolCallCount: number;
  stoppedByTool?: { name: string; input: unknown; result: unknown };
};

// =============================================================================
// Agent Loop
// =============================================================================

export async function runAgentLoop(config: AgentLoopConfig): Promise<AgentLoopResult> {
  const {
    model,
    system,
    tools,
    initialMessages,
    writer,
    agentId,
    logger,
    stopWhen,
    onMessage,
    reloadMessages,
  } = config;

  let messages = [...initialMessages];
  let shouldStop = false;
  let stoppedByTool: AgentLoopResult["stoppedByTool"];
  let lastFinishReason = "unknown";
  let toolCallCount = 0;

  while (!shouldStop) {
    logger?.info("Agent loop iteration");

    const result = streamText({ model, system, tools, messages });

    // Stream to UI - either main stream or nested sub-agent stream
    if (writer) {
      if (agentId) {
        // Sub-agent: wrap stream events with agentId for UI routing
        writer.merge(
          result.toUIMessageStream({
            sendStart: false,
            messageMetadata: () => ({ agentId }),
            onError: (error) => (error instanceof Error ? error.message : String(error)),
          }),
        );
      } else {
        // Main agent: stream directly
        writer.merge(
          result.toUIMessageStream({
            sendStart: false,
            onError: (error) => (error instanceof Error ? error.message : String(error)),
          }),
        );
      }
    }

    const [finishReason, response, toolResults] = await Promise.all([
      result.finishReason,
      result.response,
      result.toolResults,
    ]);

    lastFinishReason = finishReason;
    toolCallCount += toolResults.length;

    // Check tool results for completion signal
    for (const toolResult of toolResults) {
      if (stopWhen?.(toolResult.toolName, toolResult.input, toolResult.output)) {
        shouldStop = true;
        stoppedByTool = {
          name: toolResult.toolName,
          input: toolResult.input,
          result: toolResult.output,
        };
        break;
      }
    }

    // Save message if callback provided
    const lastMsg = response.messages[response.messages.length - 1];
    if (lastMsg?.role === "assistant" && onMessage) {
      await onMessage({ role: "assistant", content: lastMsg.content });
    }

    // Reload messages or use response messages for next iteration
    if (!shouldStop && (finishReason === "tool-calls" || finishReason === "stop")) {
      messages = reloadMessages ? await reloadMessages() : response.messages;
    } else if (finishReason !== "tool-calls") {
      shouldStop = true;
    }
  }

  return {
    success: shouldStop,
    finishReason: lastFinishReason,
    toolCallCount,
    stoppedByTool,
  };
}
