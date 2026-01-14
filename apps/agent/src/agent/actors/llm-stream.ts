/**
 * LLM Stream Actor for Agent Machine
 *
 * A callback-based actor that handles LLM streaming with cancellation support.
 * Uses XState's fromCallback to enable message-based control.
 *
 * Features:
 * - Cancellable via llm.cancel message
 * - Sends internal events back to parent for state transitions
 * - Handles tool calls including spawn_agents and add_integrations
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
  LLMUsage,
  PendingSpawnRequest,
} from "@/core/events";
import { stream } from "@/core/stream";

type LLMStreamInput = {
  messages: ModelMessage[];
  tools: ToolSet;
  activeTools: string[] | undefined;
  systemPrompt: string;
  modelId: AiModel;
  chatId: string;
  messageId: string;
  maxSubAgents: number;
};

type LLMCompletedEvent = {
  type: "_llm.completed";
  messageId: string;
  content: AssistantContentPart[];
  usage: LLMUsage;
  finishReason: FinishReason;
  pendingSpawnRequests: PendingSpawnRequest[];
  durationMs: number;
};

type LLMErrorEvent = {
  type: "_llm.error";
  error: Error;
};

type LLMCancelledEvent = {
  type: "_llm.cancelled";
  messageId: string;
};

type LLMSendBackEvent = LLMCompletedEvent | LLMErrorEvent | LLMCancelledEvent;

/**
 * Creates a cancellable LLM streaming actor.
 *
 * Receives: llm.cancel to abort the stream
 * SendBack: _llm.completed, _llm.cancelled, or _llm.error for parent state transitions
 */
export const llmStreamActor = fromCallback<LLMActorCommand, LLMStreamInput, LLMSendBackEvent>(
  ({ input, sendBack, receive }) => {
    const abortController = new AbortController();
    let isActive = true;
    const startTime = Date.now();

    receive((event) => {
      if (event.type === "llm.cancel") {
        abortController.abort();
        isActive = false;

        sendBack({
          type: "_llm.cancelled",
          messageId: input.messageId,
        });
      }
    });

    (async () => {
      const pendingSpawnRequests: PendingSpawnRequest[] = [];
      const assistantContent: AssistantContentPart[] = [];
      let usage: LLMUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      let finishReason: FinishReason = "unknown";
      let streamError: Error | null = null;
      let hasToolResults = false;
      let hasAddIntegrations = false;
      let forceContinue = false;

      try {
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
              await stream(input.chatId, {
                id: input.messageId,
                type: "text",
                text: part.text,
              });

              const lastItem = assistantContent[assistantContent.length - 1];
              if (lastItem && lastItem.type === "text") {
                lastItem.text += part.text;
              } else {
                assistantContent.push({ type: "text", text: part.text });
              }
              break;
            }

            case "reasoning-delta": {
              await stream(input.chatId, {
                id: input.messageId,
                type: "reasoning",
                text: part.text,
              });

              const lastItem = assistantContent[assistantContent.length - 1];
              if (lastItem && lastItem.type === "reasoning") {
                lastItem.text += part.text;
              } else {
                assistantContent.push({ type: "reasoning", text: part.text });
              }
              break;
            }

            case "tool-call": {
              assistantContent.push({
                type: "tool-call",
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                args: part.input,
              });

              if (part.toolName === "add_integrations") {
                hasAddIntegrations = true;
              }

              if (part.toolName === "spawn_agents") {
                const parsedInput = spawnAgentsInputSchema.safeParse(part.input);

                if (!parsedInput.success) {
                  assistantContent.push({
                    type: "tool-result",
                    toolCallId: part.toolCallId,
                    toolName: part.toolName,
                    result: {
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
                      result: {
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
              assistantContent.push({
                type: "tool-result",
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                result: part.output,
              });
              hasToolResults = true;
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
          return;
        }

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

        if (forceContinue) {
          finishReason = "tool-calls";
        }

        const durationMs = Date.now() - startTime;

        const hasToolCallResults = hasToolResults && finishReason === "tool-calls";
        const shouldStopForIntegrations = hasAddIntegrations;
        const shouldContinue =
          forceContinue ||
          finishReason === "length" ||
          (hasToolCallResults && !shouldStopForIntegrations);

        // If we should NOT continue, override finishReason to "stop" so parent knows we're done
        const effectiveFinishReason = shouldContinue ? finishReason : "stop";

        sendBack({
          type: "_llm.completed",
          messageId: input.messageId,
          content: assistantContent,
          usage,
          finishReason: effectiveFinishReason,
          pendingSpawnRequests,
          durationMs,
        });
      } catch (error) {
        if (!isActive) {
          return;
        }

        const err = error instanceof Error ? error : new Error(String(error));

        sendBack({
          type: "_llm.error",
          error: err,
        });
      }
    })();

    return () => {
      abortController.abort();
      isActive = false;
    };
  },
);

export type { LLMStreamInput };
