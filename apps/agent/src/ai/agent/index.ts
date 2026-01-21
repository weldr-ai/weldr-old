/**
 * Agent Module
 *
 * Exports for the AI agent system including main agent and sub-agents.
 */

export { runAgentLoop, type AgentLoopConfig, type AgentLoopResult } from "./agent-loop";
export { finalizeSession, type FinalizeResult } from "./finalize";
export { runMainAgent, type MainAgentInput, type MainAgentResult } from "./main-agent";
export { runSubAgents } from "./sub-agents";
export type { ChatContext, SubAgentResult, SubAgentSpec } from "./types";
