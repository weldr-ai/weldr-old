import type { Tool } from "ai";
import type { z } from "zod";

import type { SessionMachineContext } from "@/session/types";

type ToolConfig<TInput extends z.ZodSchema, TOutput extends z.ZodSchema> = {
  name: string;
  description: string;
  inputSchema: TInput;
  outputSchema: TOutput;
  execute?: (params: {
    input: z.infer<TInput>;
    context: SessionMachineContext;
  }) => Promise<z.infer<TOutput>> | undefined;
};

/**
 * Creates a tool for AI agents.
 * Note: In AI SDK 6.x, the tool name comes from the key in the ToolSet,
 * not from a 'name' property on the Tool itself.
 */
export function createTool<TInput extends z.ZodSchema, TOutput extends z.ZodSchema>(
  config: ToolConfig<TInput, TOutput>,
): (context: SessionMachineContext) => Tool<TInput, TOutput> {
  const aiSDKTool = (context: SessionMachineContext): Tool => ({
    description: config.description,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
    execute: config.execute
      ? async (input: z.infer<TInput>) => config.execute?.({ input, context })
      : undefined,
  });

  return aiSDKTool;
}
