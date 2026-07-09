/**
 * Sub-Agent Orchestrator
 *
 * Runs sub-agents respecting dependency graph using Promise.all pattern.
 * Each sub-agent streams to its own collapsible section in the UI.
 */

import { type ToolSet } from "ai";
import { z } from "zod";

import { Logger } from "@weldr/shared/logger";

import { getOrCreateWorkspace } from "@/core/workspace/just-bash";
import { registry } from "../providers";
import { queryRelatedDeclarationsTool, searchCodebaseTool } from "../tools";
import { runAgentLoop } from "./agent-loop";
import type { ChatContext, SubAgentResult, SubAgentSpec } from "./types";

// =============================================================================
// Done Tool Schema
// =============================================================================

const doneToolSchema = z.object({
  results: z
    .string()
    .describe(
      "The results of the task - include all relevant findings, file paths, code snippets, and summaries",
    ),
});

type DoneToolResult = z.infer<typeof doneToolSchema>;

// =============================================================================
// Dependency Graph Validation
// =============================================================================

function validateDependencyGraph(agents: SubAgentSpec[]): string | null {
  const ids = new Set(agents.map((a) => a.id));

  // Check for missing dependencies
  for (const agent of agents) {
    for (const dep of agent.depends ?? []) {
      if (!ids.has(dep)) {
        return `Agent "${agent.id}" depends on non-existent agent "${dep}"`;
      }
    }
  }

  // Detect cycles using DFS
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCycle(id: string): boolean {
    visited.add(id);
    recursionStack.add(id);

    const agent = agents.find((a) => a.id === id);
    for (const dep of agent?.depends ?? []) {
      if (!visited.has(dep) && hasCycle(dep)) return true;
      if (recursionStack.has(dep)) return true;
    }

    recursionStack.delete(id);
    return false;
  }

  for (const agent of agents) {
    if (!visited.has(agent.id) && hasCycle(agent.id)) {
      return "Circular dependency detected in agent graph";
    }
  }

  return null;
}

// =============================================================================
// Ready Agents Detection
// =============================================================================

function getReadyAgents(
  agents: SubAgentSpec[],
  completed: Set<string>,
  running: Set<string>,
): SubAgentSpec[] {
  return agents.filter((agent) => {
    if (completed.has(agent.id) || running.has(agent.id)) return false;
    const deps = agent.depends ?? [];
    return deps.every((dep) => completed.has(dep));
  });
}

// =============================================================================
// Sub-Agent Tool Set Builder
// =============================================================================

async function buildSubAgentToolSet(context: ChatContext): Promise<ToolSet> {
  const snapshotId = context.branch.snapshot?.id;

  if (!snapshotId) {
    throw new Error("Branch has no snapshot");
  }

  const { tools: bashTools } = await getOrCreateWorkspace({
    snapshotId,
    projectId: context.project.id,
  });

  // Sub-agents get a limited toolset - no spawn_agents to prevent recursion
  return {
    ...bashTools.tools,
    searchCodebase: searchCodebaseTool(context),
    queryRelatedDeclarations: queryRelatedDeclarationsTool(context),
    // Note: spawnAgents and addIntegrations are intentionally excluded
  } as unknown as ToolSet;
}

// =============================================================================
// Single Sub-Agent Runner
// =============================================================================

async function runSubAgent(
  agent: SubAgentSpec,
  context: ChatContext,
  logger: ReturnType<typeof Logger.get>,
): Promise<SubAgentResult> {
  const subAgentPrompt = `You are a sub-agent with a specific task.

TASK: ${agent.task}
${agent.context ? `\nCONTEXT: ${agent.context}` : ""}

RULES:
1. Focus ONLY on the assigned task
2. You CANNOT spawn other agents
3. Be efficient - complete in as few steps as possible
4. When you have completed your task, you MUST call the "done" tool with your findings
5. The "done" tool is the ONLY way to report your results back to the orchestrator
6. Include ALL relevant information in the done tool - file paths, code snippets, summaries, etc.`;

  try {
    const tools = await buildSubAgentToolSet(context);

    // Add the done tool to signal completion
    const toolsWithDone: ToolSet = {
      ...tools,
      done: {
        description:
          "Call this tool when you have completed your task. This is the ONLY way to report your results back to the orchestrator.",
        inputSchema: doneToolSchema,
      },
    };

    // Run the agent loop - streams to its own section via agentId
    const result = await runAgentLoop({
      model: registry.languageModel(context.modelId),
      system: subAgentPrompt,
      tools: toolsWithDone,
      initialMessages: [],
      writer: context.writer,
      agentId: agent.id,
      logger,
      stopWhen: (name) => name === "done",
    });

    // Extract done tool result
    if (result.stoppedByTool?.name === "done") {
      const doneResult = result.stoppedByTool.input as DoneToolResult;

      logger.info("Sub-agent completed", {
        extra: {
          agentId: agent.id,
          toolCallCount: result.toolCallCount,
        },
      });

      return {
        id: agent.id,
        task: agent.task,
        success: true,
        result: doneResult.results,
      };
    }

    // Loop ended without done tool (shouldn't happen with stopWhen)
    logger.warn("Sub-agent ended without calling done", {
      extra: { agentId: agent.id, finishReason: result.finishReason },
    });

    return {
      id: agent.id,
      task: agent.task,
      success: false,
      result: "Sub-agent ended without completing task",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.warn("Sub-agent failed", {
      extra: {
        agentId: agent.id,
        error: errorMessage,
      },
    });

    return {
      id: agent.id,
      task: agent.task,
      success: false,
      result: errorMessage,
    };
  }
}

// =============================================================================
// Main Orchestrator
// =============================================================================

/**
 * Runs sub-agents from ChatContext.
 * Streams progress updates via the writer in context.
 */
export async function runSubAgents(
  input: { agents: SubAgentSpec[] },
  context: ChatContext,
): Promise<{ results: SubAgentResult[] }> {
  const { agents } = input;

  const logger = Logger.get({
    projectId: context.project.id,
    chatId: context.chatId,
    module: "sub-agents",
  });

  // Validate dependency graph
  const validationError = validateDependencyGraph(agents);
  if (validationError) {
    logger.error("Dependency graph validation failed", {
      extra: { error: validationError },
    });

    return {
      results: agents.map((a) => ({
        id: a.id,
        task: a.task,
        success: false,
        result: validationError,
      })),
    };
  }

  const results: SubAgentResult[] = [];
  const completed = new Set<string>();
  const failed = new Set<string>();
  const running = new Set<string>();

  if (!context.writer) {
    throw new Error("Writer not found");
  }

  // Send orchestrator started event (transient)
  context.writer.write({
    type: "data-orchestrator",
    data: {
      event: "started",
      agentCount: agents.length,
    },
    transient: true,
  });

  logger.info("Orchestrator started", {
    extra: { agentCount: agents.length },
  });

  while (completed.size + failed.size < agents.length) {
    const ready = getReadyAgents(agents, completed, running);

    if (ready.length === 0 && running.size === 0) {
      // Deadlock - mark remaining as failed
      for (const agent of agents) {
        if (!completed.has(agent.id) && !failed.has(agent.id)) {
          results.push({
            id: agent.id,
            task: agent.task,
            success: false,
            result: "Dependency failed",
          });
          failed.add(agent.id);
        }
      }
      break;
    }

    // Run ready agents in parallel with Promise.all
    const runningPromises = ready.map(async (agent) => {
      if (!context.writer) {
        throw new Error("Writer not found");
      }

      running.add(agent.id);

      context.writer.write({
        type: "data-subagent",
        data: {
          event: "started",
          agentId: agent.id,
          task: agent.task,
        },
        transient: true,
      });

      logger.info("Sub-agent started", {
        extra: { agentId: agent.id, task: agent.task },
      });

      const result = await runSubAgent(agent, context, logger);

      running.delete(agent.id);

      if (result.success) {
        completed.add(agent.id);
      } else {
        failed.add(agent.id);
        // Mark dependents as failed
        for (const other of agents) {
          if (
            other.depends?.includes(agent.id) &&
            !completed.has(other.id) &&
            !failed.has(other.id)
          ) {
            failed.add(other.id);
            results.push({
              id: other.id,
              task: other.task,
              success: false,
              result: `Dependency "${agent.id}" failed`,
            });
          }
        }
      }

      results.push(result);

      context.writer.write({
        type: "data-subagent",
        data: {
          event: "completed",
          agentId: agent.id,
          success: result.success,
        },
        transient: true,
      });

      logger.info("Sub-agent finished", {
        extra: {
          agentId: agent.id,
          success: result.success,
        },
      });

      return result;
    });

    await Promise.all(runningPromises);
  }

  context.writer.write({
    type: "data-orchestrator",
    data: {
      event: "completed",
    },
    transient: true,
  });

  logger.info("Orchestrator completed", {
    extra: {
      total: agents.length,
      completed: completed.size,
      failed: failed.size,
    },
  });

  return { results };
}
