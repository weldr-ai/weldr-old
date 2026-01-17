import type { OrchestratorContext, SubAgentState } from "./types";

type AgentWithDependencies = Pick<SubAgentState, "id" | "depends">;

/**
 * Validates the dependency graph for circular dependencies using Kahn's algorithm.
 * Returns an error message if a cycle is detected, undefined if valid.
 */
export function validateDependencyGraph(agents: AgentWithDependencies[]): string | undefined {
  const agentIds = new Set(agents.map((a) => a.id));

  for (const agent of agents) {
    for (const dep of agent.depends) {
      if (!agentIds.has(dep)) {
        return `Agent "${agent.id}" depends on unknown agent "${dep}"`;
      }
      if (dep === agent.id) {
        return `Agent "${agent.id}" cannot depend on itself`;
      }
    }
  }

  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const agent of agents) {
    inDegree.set(agent.id, 0);
    adjacency.set(agent.id, []);
  }

  for (const agent of agents) {
    for (const dep of agent.depends) {
      const existing = adjacency.get(dep) ?? [];
      existing.push(agent.id);
      adjacency.set(dep, existing);
      inDegree.set(agent.id, (inDegree.get(agent.id) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  let processedCount = 0;
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      break;
    }
    processedCount++;

    for (const dependent of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(dependent) ?? 1) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) {
        queue.push(dependent);
      }
    }
  }

  if (processedCount !== agents.length) {
    const cycleAgents = agents.filter((a) => (inDegree.get(a.id) ?? 0) > 0).map((a) => a.id);
    return `Circular dependency detected involving agents: ${cycleAgents.join(", ")}`;
  }

  return undefined;
}

/**
 * Returns agents that are ready to run (status is 'waiting' and all dependencies are completed).
 */
export function getReadyAgents(context: OrchestratorContext): SubAgentState[] {
  const completedIds = new Set(
    context.agents.filter((a) => a.status === "completed").map((a) => a.id),
  );

  return context.agents.filter((agent) => {
    if (agent.status !== "waiting") {
      return false;
    }
    return agent.depends.every((depId) => completedIds.has(depId));
  });
}

/**
 * Returns agent IDs that directly or transitively depend on the given agent ID.
 */
export function getDependentAgents(context: OrchestratorContext, failedAgentId: string): string[] {
  const dependents = new Set<string>();
  const queue = [failedAgentId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      break;
    }

    for (const agent of context.agents) {
      if (agent.depends.includes(current) && !dependents.has(agent.id)) {
        dependents.add(agent.id);
        queue.push(agent.id);
      }
    }
  }

  return Array.from(dependents);
}

/**
 * Checks if all agents have resolved (completed or failed).
 */
export function areAllAgentsResolved(context: OrchestratorContext): boolean {
  return context.agents.every((a) => a.status === "completed" || a.status === "failed");
}

/**
 * Checks if an agent can be retried.
 */
export function canRetryAgent(context: OrchestratorContext, agentId: string): boolean {
  const agent = context.agents.find((a) => a.id === agentId);
  if (!agent) {
    return false;
  }
  return agent.retryCount < context.maxRetries;
}
