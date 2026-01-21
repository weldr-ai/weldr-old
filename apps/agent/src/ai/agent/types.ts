/**
 * Chat Types
 *
 * Type definitions for the chat system using AI SDK.
 */

import type { UIMessageStreamWriter } from "ai";

import type { AiModel } from "@weldr/db/schema";

import type { BranchWithSnapshot, ProjectWithConfig, User } from "@/core/types";

// =============================================================================
// Chat Context
// =============================================================================

export type ChatContext = {
  chatId?: string;
  project: ProjectWithConfig;
  branch: BranchWithSnapshot;
  user: User;
  modelId: AiModel;
  writer?: UIMessageStreamWriter;
};

// =============================================================================
// Sub-Agent Types
// =============================================================================

export type SubAgentSpec = {
  id: string;
  task: string;
  context?: string;
  depends?: string[];
};

export type SubAgentResult = {
  id: string;
  task: string;
  success: boolean;
  result: string;
};
