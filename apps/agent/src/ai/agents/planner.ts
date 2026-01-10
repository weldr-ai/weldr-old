import { type AssistantContent, streamText, type ToolSet } from "ai";

import { Logger } from "@weldr/shared/logger";
import { nanoid } from "@weldr/shared/nanoid";

import { prompts } from "@/ai/prompts";
import { addIntegrationsTool, bashTool, callCoderTool, searchCodebaseTool } from "@/ai/tools";
import { getMessages } from "@/ai/utils/get-messages";
import { registry } from "@/ai/utils/registry";
import { stream } from "@/lib/stream-utils";
import { workflow } from "@/workflow";
import type { WorkflowContext } from "@/workflow/context";
import { queryRelatedDeclarationsTool } from "../tools/query-related-declarations";
import { insertMessages } from "../utils/insert-messages";
import { calculateModelCost } from "../utils/providers-pricing";

export async function plannerAgent({
  context,
  coolDownPeriod = 100,
}: {
  context: WorkflowContext;
  coolDownPeriod?: number;
}): Promise<void> {
  const project = context.get("project");
  const user = context.get("user");
  const branch = context.get("branch");

  const logger = Logger.get({
    projectId: project.id,
    versionId: branch.headVersion.id,
  });

  const tools: ToolSet = {
    bash: bashTool(context),
    search_codebase: searchCodebaseTool(context),
    query_related_declarations: queryRelatedDeclarationsTool(context),
    call_coder: callCoderTool(context),
    add_integrations: addIntegrationsTool(context),
  };

  const system = await prompts.planner(project);

  // Local function to execute planner agent and handle tool calls
  const executePlannerAgent = async (): Promise<{
    shouldRecur: boolean;
    callingCoder: boolean;
  }> => {
    let shouldRecur = false;
    let callingCoder = false;
    const promptMessages = await getMessages(branch.headVersion.chatId);

    logger.info("promptMessages", {
      extra: { promptMessages },
    });

    const result = streamText({
      model: registry.languageModel("google:gemini-2.5-pro"),
      system,
      tools,
      messages: promptMessages,
      onError: (error) => {
        logger.error("Error in planner agent", {
          extra: { error },
        });
      },
    });

    const messageId = nanoid();
    const assistantContent: AssistantContent = [];

    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta": {
          await stream(branch.headVersion.chatId, {
            id: messageId,
            type: "text",
            text: part.text,
          });
          const lastItem = assistantContent[assistantContent.length - 1];
          if (lastItem && lastItem.type === "text") {
            lastItem.text += part.text;
          } else {
            assistantContent.push({
              type: "text",
              text: part.text,
            });
          }
          break;
        }
        case "reasoning-delta": {
          await stream(branch.headVersion.chatId, {
            id: part.id,
            type: "reasoning",
            text: part.text,
          });
          const lastItem = assistantContent[assistantContent.length - 1];
          if (lastItem && lastItem.type === "reasoning") {
            lastItem.text += part.text;
          } else {
            assistantContent.push({
              type: "reasoning",
              text: part.text,
            });
          }
          break;
        }
        case "tool-result": {
          if (part.toolName === "call_coder") {
            callingCoder = true;
            assistantContent.push({
              type: "tool-call",
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: part.input,
            });
          }

          if (
            part.toolName === "bash" ||
            part.toolName === "search_codebase" ||
            part.toolName === "query_related_declarations"
          ) {
            shouldRecur = true;
            assistantContent.push({
              type: "tool-call",
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: part.input,
            });
          }

          if (part.toolName === "add_integrations") {
            if (part.input.status === "failed") {
              shouldRecur = true;
              break;
            } else {
              if (part.output.categories.length > 0) {
                await stream(branch.headVersion.chatId, {
                  id: messageId,
                  type: "tool-call",
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  input: {
                    ...part.input,
                    status: "awaiting_config",
                  },
                });
                assistantContent.push({
                  type: "tool-call",
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  input: {
                    ...part.input,
                    status: "awaiting_config",
                  },
                });
                shouldRecur = false;
              } else {
                shouldRecur = true;
              }
            }
          }
          break;
        }
        case "tool-error": {
          shouldRecur = true;
          break;
        }
      }
    }

    const usage = await result.usage;

    const cost = await calculateModelCost(
      "google:gemini-2.5-pro",
      usage?.inputTokens ?? 0,
      usage?.outputTokens ?? 0,
    );

    const finishReason = await result.finishReason;

    await insertMessages({
      input: {
        chatId: branch.headVersion.chatId,
        userId: user.id,
        messages: [
          {
            id: messageId,
            role: "assistant",
            content: assistantContent,
            metadata: {
              provider: "google",
              model: "gemini-2.5-pro",
              inputTokens: usage?.inputTokens,
              outputTokens: usage?.outputTokens,
              totalTokens: usage?.totalTokens,
              inputCost: cost?.inputCost,
              outputCost: cost?.outputCost,
              totalCost: cost?.totalCost,
              inputTokensPrice: cost?.inputTokensPrice,
              outputTokensPrice: cost?.outputTokensPrice,
              inputImagesPrice: cost?.inputImagesPrice,
              finishReason,
            },
            createdAt: new Date(),
          },
        ],
      },
    });

    if (finishReason === "length") {
      shouldRecur = true;
    }

    return { shouldRecur, callingCoder };
  };

  // Main execution loop for the planner agent
  let shouldContinue = true;
  let iterationCount = 0;
  let calledCoder = false;
  while (shouldContinue) {
    iterationCount++;
    logger.info(`Starting planner agent iteration ${iterationCount}`);
    const { shouldRecur, callingCoder } = await executePlannerAgent();

    shouldContinue = shouldRecur;
    if (callingCoder) {
      calledCoder = true;
    }

    if (shouldContinue) {
      logger.info(`Recurring in ${coolDownPeriod}ms...`);
      await new Promise((resolve) => setTimeout(resolve, coolDownPeriod));
    }
  }

  // Only suspend if we're done AND we didn't call the coder
  // If we called the coder, the workflow will continue automatically
  // when the version status changes to "coding"
  if (!calledCoder) {
    workflow.suspend();
  }

  logger.info("Planner agent completed");
}
