/**
 * UI Message Types
 *
 * Type definitions for AI SDK UIMessage with Weldr-specific tools and data parts.
 * These types provide type safety for tool inputs/outputs and custom data parts
 * in the frontend message rendering.
 */

import type { UIMessage } from "ai";
import { z } from "zod";

import { integrationCategoryKeySchema } from "./integration-categories";

// =============================================================================
// Tool Input/Output Schemas
// =============================================================================

/**
 * search_codebase tool schemas
 */
export const searchCodebaseInputSchema = z.object({
  query: z.string(),
  limit: z.number().int().positive().optional(),
  minSimilarity: z.number().min(0).max(1).optional(),
});

export const searchCodebaseOutputSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    formattedResults: z.string(),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
  }),
]);

/**
 * query_related_declarations tool schemas
 */
export const queryRelatedDeclarationsInputSchema = z.object({
  declarationId: z.string(),
  queryType: z.enum(["dependencies", "dependents", "both"]).default("both"),
});

export const queryRelatedDeclarationsOutputSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    formattedResults: z.string(),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
  }),
]);

/**
 * spawn_agents tool schemas
 */
export const spawnAgentsInputSchema = z.object({
  agents: z
    .object({
      id: z.string(),
      task: z.string(),
      context: z.string().optional(),
      depends: z.array(z.string()).optional(),
    })
    .array()
    .min(1)
    .max(10),
});

export const spawnAgentsOutputSchema = z.object({
  results: z
    .object({
      id: z.string(),
      task: z.string(),
      success: z.boolean(),
      result: z.string(),
    })
    .array(),
});

/**
 * add_integrations tool schemas
 */
export const addIntegrationsInputSchema = z.object({
  categories: z.array(integrationCategoryKeySchema),
});

export const addIntegrationsOutputSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("awaiting_config"),
    categories: z.array(integrationCategoryKeySchema),
  }),
  z.object({
    status: z.literal("failed"),
    error: z.string(),
  }),
]);

// =============================================================================
// Tool Input/Output Types
// =============================================================================

export type SearchCodebaseInput = z.infer<typeof searchCodebaseInputSchema>;
export type SearchCodebaseOutput = z.infer<typeof searchCodebaseOutputSchema>;

export type QueryRelatedDeclarationsInput = z.infer<typeof queryRelatedDeclarationsInputSchema>;
export type QueryRelatedDeclarationsOutput = z.infer<typeof queryRelatedDeclarationsOutputSchema>;

export type SpawnAgentsInput = z.infer<typeof spawnAgentsInputSchema>;
export type SpawnAgentsOutput = z.infer<typeof spawnAgentsOutputSchema>;

export type AddIntegrationsInput = z.infer<typeof addIntegrationsInputSchema>;
export type AddIntegrationsOutput = z.infer<typeof addIntegrationsOutputSchema>;

// =============================================================================
// Weldr UI Tools Type
// =============================================================================

/**
 * Type definition for Weldr tools in UIMessage.
 * This maps tool names to their input/output types for type-safe tool rendering.
 */
export type WeldrUITools = {
  search_codebase: {
    input: SearchCodebaseInput;
    output: SearchCodebaseOutput;
  };
  query_related_declarations: {
    input: QueryRelatedDeclarationsInput;
    output: QueryRelatedDeclarationsOutput;
  };
  spawn_agents: {
    input: SpawnAgentsInput;
    output: SpawnAgentsOutput;
  };
  add_integrations: {
    input: AddIntegrationsInput;
    output: AddIntegrationsOutput;
  };
};

// =============================================================================
// Custom Data Part Types
// =============================================================================

export type StatusDataPart = {
  status: "thinking" | "responding" | "finalizing" | "idle";
};

export type OrchestratorDataPart = {
  event: "started" | "completed";
  agentCount?: number;
};

export type SubAgentDataPart = {
  event: "started" | "completed";
  agentId: string;
  task?: string;
  success?: boolean;
};

export type BranchUpdateDataPart = {
  commitSha?: string;
  name?: string;
};

export type ProjectUpdateDataPart = {
  title?: string;
  description?: string;
};

export type NodeDataPart = {
  nodeId: string;
  position: { x: number; y: number };
  metadata: Record<string, unknown>;
};

/**
 * All custom data parts for Weldr UIMessage.
 * Keys are used as suffixes in data part types (e.g., "data-status", "data-orchestrator").
 */
export type WeldrDataParts = {
  status: StatusDataPart;
  orchestrator: OrchestratorDataPart;
  subagent: SubAgentDataPart;
  "branch-update": BranchUpdateDataPart;
  "project-update": ProjectUpdateDataPart;
  node: NodeDataPart;
};

// =============================================================================
// Weldr UI Message Metadata
// =============================================================================

export type WeldrMessageMetadata = {
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
};

// =============================================================================
// Weldr UI Message Type
// =============================================================================

/**
 * Fully typed UIMessage for Weldr with:
 * - Custom metadata (usage info)
 * - Custom data parts (status, orchestrator, subagent, etc.)
 * - Typed tool inputs/outputs
 */
export type WeldrUIMessage = UIMessage<WeldrMessageMetadata, WeldrDataParts, WeldrUITools>;
