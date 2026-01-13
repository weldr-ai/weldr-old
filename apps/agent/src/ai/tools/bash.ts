import type { Tool } from "ai";
import { z } from "zod";

import { Logger } from "@weldr/shared/logger";

import { exec } from "@/core/sandbox/exec";

/**
 * Result of a bash command execution
 */
export interface BashResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Bash tools type - compatible with ToolSet
 */
export type BashTools = Record<string, Tool>;

const bashInputSchema = z.object({
  command: z.string().describe("The bash command to execute"),
});

const bashOutputSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number(),
});

/**
 * Create bash tools for AI agents.
 * All commands are executed via agentfs CLI which provides FUSE-based isolation.
 */
export function createBashTools(projectId: string, branchId: string): BashTools {
  const logger = Logger.get({ projectId, branchId, component: "bash-tool" });

  const bashTool: Tool = {
    description: `Execute a bash command in the sandboxed environment. All file changes are isolated and persisted to the session.`,
    inputSchema: bashInputSchema,
    outputSchema: bashOutputSchema,
    execute: async (params: z.infer<typeof bashInputSchema>): Promise<BashResult> => {
      const { command } = params;
      logger.debug(`Executing bash command: ${command}`);

      const result = exec(command, {
        projectId,
        branchId,
      });

      logger.debug(`Bash command completed with exit code ${result.exitCode}`, {
        extra: { command, stdout: result.stdout.slice(0, 500) },
      });

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      };
    },
  };

  return {
    bash: bashTool,
  };
}

/**
 * Get or create bash tools for a branch.
 * This function is kept for backwards compatibility with existing code.
 */
export async function getOrCreateBashTool(projectId: string, branchId: string): Promise<BashTools> {
  return createBashTools(projectId, branchId);
}
