import type { Tool } from "ai";
import type { z } from "zod";

import type { WorkflowContext } from "@/workflow/context";

type ToolConfig<
  TName extends string,
  TInput extends z.ZodSchema,
  TOutput extends z.ZodSchema,
> = {
  name: TName;
  description: string;
  whenToUse: string;
  inputSchema: TInput;
  outputSchema: TOutput;
  execute?: (params: {
    input: z.infer<TInput>;
    context: WorkflowContext;
  }) => Promise<z.infer<TOutput>> | undefined;
};

/**
 * Creates a tool for AI agents.
 */
export function createTool<
  TName extends string,
  TInput extends z.ZodSchema,
  TOutput extends z.ZodSchema,
>(config: ToolConfig<TName, TInput, TOutput>) {
  const aiSDKTool = (context: WorkflowContext): Tool => ({
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
    execute: config.execute
      ? async (input: z.infer<TInput>) => config.execute?.({ input, context })
      : undefined,
  });

  return aiSDKTool;
}
