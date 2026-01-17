/**
 * LLM Stream Actor
 *
 * A callback-based actor that handles LLM streaming with cancellation support.
 * Uses XState's fromCallback to enable message-based control.
 *
 * Features:
 * - Cancellable via llm.cancel message
 * - Emits public events for SSE streaming
 * - Sends internal events back to parent for state transitions
 * - Handles tool calls including spawn_agents
 */

import { hasToolCall, streamText, type ModelMessage, type ToolSet } from "ai";
import { fromCallback } from "xstate";

import type { AiModel } from "@weldr/db/schema";

import { registry } from "@/ai/providers";
import { spawnAgentsInputSchema } from "@/ai/tools/spawn-agents";
import type {
  AssistantContentPart,
  FinishReason,
  LLMActorCommand,
  LLMCancelledEvent,
  LLMCompletedEvent,
  LLMDeltaReasoningEvent,
  LLMDeltaTextEvent,
  LLMErrorEvent,
  LLMStartedEvent,
  LLMToolCallEvent,
  LLMToolResultEvent,
  LLMUsage,
  PendingSpawnRequest,
} from "@/core/events";

export type LLMStreamInput = {
  messages: ModelMessage[];
  tools: ToolSet;
  activeTools: string[] | undefined;
  systemPrompt: string;
  modelId: AiModel;
  messageId: string;
  maxSubAgents: number;
};

type LLMStreamEmittedEvent =
  | LLMStartedEvent
  | LLMDeltaTextEvent
  | LLMDeltaReasoningEvent
  | LLMToolCallEvent
  | LLMToolResultEvent
  | LLMCompletedEvent
  | LLMCancelledEvent
  | LLMErrorEvent;

/**
 * Creates a cancellable LLM streaming actor.
 *
 * Receives: llm.cancel to abort the stream
 * Emits: llm.* public events for SSE
 * SendBack: _llm.completed or _llm.error for parent state transitions
 */
export const llmStreamActor = fromCallback<LLMActorCommand, LLMStreamInput, LLMStreamEmittedEvent>(
  ({ input, sendBack, receive, emit }) => {
    const abortController = new AbortController();
    let isActive = true;
    const startTime = Date.now();

    // Handle incoming control messages
    receive((event) => {
      if (event.type === "llm.cancel") {
        abortController.abort();
        isActive = false;

        emit({
          type: "llm.cancelled",
          messageId: input.messageId,
          reason: event.reason ?? "cancelled",
        });

        // Note: sendBack is not called here - the parent will handle the cancellation
        // via the abort signal causing the stream to end
      }
    });

    // Run the LLM stream
    (async () => {
      const pendingSpawnRequests: PendingSpawnRequest[] = [];
      const assistantContent: AssistantContentPart[] = [];
      let usage: LLMUsage | null = null;
      let finishReason: FinishReason = "unknown";
      let streamError: Error | null = null;
      let forceContinue = false;

      try {
        // Emit stream started
        emit({
          type: "llm.started",
          messageId: input.messageId,
          modelId: input.modelId,
        });

        const result = streamText({
          model: registry.languageModel(input.modelId),
          system: input.systemPrompt,
          tools: input.tools,
          experimental_activeTools: input.activeTools,
          messages: input.messages,
          stopWhen: [hasToolCall("add_integrations"), hasToolCall("spawn_agents")],
          abortSignal: abortController.signal,
          onError: (error) => {
            const errorValue = error instanceof Error ? error : new Error(String(error));
            streamError = errorValue;
          },
        });

        for await (const part of result.fullStream) {
          if (!isActive) break;

          switch (part.type) {
            case "text-delta": {
              emit({
                type: "llm.delta.text",
                messageId: input.messageId,
                text: part.text,
              });

              // Accumulate text in assistant content
              const lastItem = assistantContent[assistantContent.length - 1];
              if (lastItem && lastItem.type === "text") {
                lastItem.text += part.text;
              } else {
                assistantContent.push({ type: "text", text: part.text });
              }
              break;
            }

            case "reasoning-delta": {
              emit({
                type: "llm.delta.reasoning",
                messageId: input.messageId,
                text: part.text,
              });

              // Accumulate reasoning in assistant content
              const lastItem = assistantContent[assistantContent.length - 1];
              if (lastItem && lastItem.type === "reasoning") {
                lastItem.text += part.text;
              } else {
                assistantContent.push({ type: "reasoning", text: part.text });
              }
              break;
            }

            case "tool-call": {
              emit({
                type: "llm.tool_call",
                messageId: input.messageId,
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                args: part.input,
              });

              assistantContent.push({
                type: "tool-call",
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                args: part.input,
              });

              // Handle spawn_agents tool call
              if (part.toolName === "spawn_agents") {
                const parsedInput = spawnAgentsInputSchema.safeParse(part.input);

                if (!parsedInput.success) {
                  assistantContent.push({
                    type: "tool-result",
                    toolCallId: part.toolCallId,
                    toolName: part.toolName,
                    output: {
                      type: "error-text" as const,
                      value: "Invalid spawn_agents input.",
                    },
                    isError: true,
                  });
                  forceContinue = true;
                } else {
                  const agentCount = parsedInput.data.agents.length;

                  if (agentCount <= input.maxSubAgents) {
                    pendingSpawnRequests.push({
                      toolCallId: part.toolCallId,
                      agents: parsedInput.data.agents.map((a) => ({
                        id:
                          a.id ?? `agent-${part.toolCallId}-${parsedInput.data.agents.indexOf(a)}`,
                        task: a.task,
                        context: a.context,
                        depends: a.depends,
                      })),
                    });
                  } else {
                    assistantContent.push({
                      type: "tool-result",
                      toolCallId: part.toolCallId,
                      toolName: part.toolName,
                      output: {
                        type: "error-text" as const,
                        value: `Cannot spawn ${agentCount} agents. Maximum allowed is ${input.maxSubAgents}.`,
                      },
                      isError: true,
                    });
                    forceContinue = true;
                  }
                }
              }
              break;
            }

            case "tool-result": {
              emit({
                type: "llm.tool_result",
                messageId: input.messageId,
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                result: part.output,
              });

              assistantContent.push({
                type: "tool-result",
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                output: part.output,
              });
              break;
            }

            case "error": {
              const errorValue =
                part.error instanceof Error
                  ? part.error
                  : new Error(String(part.error ?? "LLM stream error"));
              streamError = errorValue;
              break;
            }
          }
        }

        if (streamError) {
          throw streamError;
        }

        if (!isActive) {
          // Stream was cancelled
          return;
        }

        // Get final usage and finish reason
        const resultUsage = await result.usage;
        const resultFinishReason = await result.finishReason;

        if (resultUsage) {
          usage = {
            inputTokens: resultUsage.inputTokens ?? 0,
            outputTokens: resultUsage.outputTokens ?? 0,
            totalTokens: resultUsage.totalTokens ?? 0,
          };
        }

        if (resultFinishReason) {
          finishReason = resultFinishReason as FinishReason;
        }

        // Adjust finish reason for force continue
        if (forceContinue) {
          finishReason = "tool-calls";
        }

        const durationMs = Date.now() - startTime;

        // Emit completion event
        emit({
          type: "llm.completed",
          messageId: input.messageId,
          usage: usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          finishReason,
        });

        // Send result back to parent
        sendBack({
          type: "_llm.completed",
          messageId: input.messageId,
          content: assistantContent,
          usage: usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          finishReason,
          pendingSpawnRequests,
          durationMs,
        });
      } catch (error) {
        if (!isActive) {
          // Cancelled - don't send error
          return;
        }

        const err = error instanceof Error ? error : new Error(String(error));

        emit({
          type: "llm.error",
          messageId: input.messageId,
          error: { message: err.message, stack: err.stack },
        });

        sendBack({
          type: "_llm.error",
          error: err,
        });
      }
    })();

    // Cleanup function - called when actor is stopped
    return () => {
      abortController.abort();
      isActive = false;
    };
  },
);
