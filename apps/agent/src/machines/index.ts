// Export all machines
export { sessionMachine, type SessionMachine, type SessionActorRef } from "./session";
export { agentMachine, type AgentMachine, type AgentSnapshot } from "./agent";
export { toolMachine, type ToolMachine, type ToolActorRef } from "./tool";

// Export session machine types
export type {
  AgentResult,
  ProjectWithConfig,
  BranchWithVersion,
  SessionMachineContext,
  SessionMachineInput,
  SessionMachineEvents,
} from "./session";

// Export tool machine types
export type {
  ToolMachineContext,
  ToolMachineInput,
  ToolMachineEvents,
  ToolMachineOutput,
  ToolExecutor,
} from "./tool";

// Export all types
export * from "./types";

// Export utility functions for creating actors
export { createActor } from "xstate";
