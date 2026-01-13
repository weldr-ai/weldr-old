// Export all machines
export { sessionMachine, type SessionMachine, type SessionActorRef } from "./session";
export { agentMachine, type AgentMachine, type AgentSnapshot } from "./agent";

// Export session machine types
export type {
  ProjectWithConfig,
  BranchWithVersion,
  SessionMachineContext,
  SessionMachineInput,
  SessionMachineEvents,
} from "./session";

// Export utility functions for creating actors
export { createActor } from "xstate";
