import { assign, setup, type ActorRefFrom } from "xstate";

import { Logger } from "@weldr/shared/logger";

import { executeToolActor, type ToolExecutor } from "@/actors/tool/execute-tool";

const isToolFailure = (output: unknown): output is { success: false; error?: string } => {
  if (typeof output !== "object" || output === null) {
    return false;
  }

  if (!("success" in output)) {
    return false;
  }

  return (output as { success?: unknown }).success === false;
};

const getToolFailureError = (output: unknown): Error => {
  if (typeof output === "object" && output !== null && "error" in output) {
    const errorValue = (output as { error?: unknown }).error;
    if (typeof errorValue === "string") {
      return new Error(errorValue);
    }
  }

  return new Error("Tool returned failure");
};

type ToolMachineContext = {
  toolName: string;
  input: unknown;
  output: unknown | null;
  error: Error | null;
  startTime: number;
  endTime: number | null;
  toolExecutor: ToolExecutor;
};

type ToolMachineInput = {
  toolName: string;
  input: unknown;
  toolExecutor: ToolExecutor;
};

type ExecuteEvent = {
  type: "EXECUTE";
  toolName: string;
  input: unknown;
};

type ToolMachineEvents = ExecuteEvent;

type ToolMachineOutput =
  | { success: true; output: unknown; durationMs: number }
  | { success: false; error: Error; durationMs: number };

export const toolMachine = setup({
  types: {
    context: {} as ToolMachineContext,
    input: {} as ToolMachineInput,
    events: {} as ToolMachineEvents,
    output: {} as ToolMachineOutput,
  },
  actors: {
    executeTool: executeToolActor,
  },
  actions: {
    logStart: ({ context }) => {
      const logger = Logger.get({ actor: "tool-machine", toolName: context.toolName });
      logger.info("Tool execution started", {
        extra: { toolName: context.toolName },
      });
    },
    logComplete: ({ context }) => {
      const logger = Logger.get({ actor: "tool-machine", toolName: context.toolName });
      const durationMs = context.endTime ? context.endTime - context.startTime : 0;
      logger.info("Tool execution completed", {
        extra: { toolName: context.toolName, durationMs },
      });
    },
    logError: ({ context }) => {
      const logger = Logger.get({ actor: "tool-machine", toolName: context.toolName });
      const durationMs = context.endTime ? context.endTime - context.startTime : 0;
      logger.error("Tool execution failed", {
        extra: {
          toolName: context.toolName,
          durationMs,
          error: context.error?.message,
        },
      });
    },
    setStartTime: assign({
      startTime: () => Date.now(),
    }),
    setEndTime: assign({
      endTime: () => Date.now(),
    }),
    setToolName: assign({
      toolName: (_, params: { toolName: string }) => params.toolName,
    }),
    setInput: assign({
      input: (_, params: { input: unknown }) => params.input,
    }),
    setOutput: assign({
      output: (_, params: { output: unknown }) => params.output,
    }),
    setError: assign({
      error: (_, params: { error: unknown }) => {
        if (params.error instanceof Error) {
          return params.error;
        }
        return new Error(String(params.error));
      },
    }),
  },
  guards: {
    hasOutput: ({ context }) => context.output !== null,
    hasError: ({ context }) => context.error !== null,
  },
}).createMachine({
  id: "tool",
  initial: "idle",
  context: ({ input }) => ({
    toolName: input.toolName,
    input: input.input,
    output: null,
    error: null,
    startTime: 0,
    endTime: null,
    toolExecutor: input.toolExecutor,
  }),
  states: {
    idle: {
      on: {
        EXECUTE: {
          target: "executing",
          actions: [
            {
              type: "setToolName",
              params: ({ event }) => ({ toolName: event.toolName }),
            },
            {
              type: "setInput",
              params: ({ event }) => ({ input: event.input }),
            },
            "setStartTime",
            "logStart",
          ],
        },
      },
    },

    executing: {
      invoke: {
        id: "executeTool",
        src: "executeTool",
        input: ({ context }) => ({
          toolName: context.toolName,
          input: context.input,
          toolExecutor: context.toolExecutor,
        }),
        onDone: [
          {
            target: "failed",
            guard: ({ event }) => isToolFailure(event.output),
            actions: [
              "setEndTime",
              {
                type: "setError",
                params: ({ event }) => ({ error: getToolFailureError(event.output) }),
              },
              "logError",
            ],
          },
          {
            target: "completed",
            actions: [
              "setEndTime",
              {
                type: "setOutput",
                params: ({ event }) => ({ output: event.output }),
              },
              "logComplete",
            ],
          },
        ],
        onError: {
          target: "failed",
          actions: [
            "setEndTime",
            {
              type: "setError",
              params: ({ event }) => ({ error: event.error }),
            },
            "logError",
          ],
        },
      },
    },

    completed: {
      type: "final",
    },

    failed: {
      type: "final",
    },
  },
  output: ({ context }): ToolMachineOutput => {
    const durationMs = context.endTime ? context.endTime - context.startTime : 0;

    if (context.error) {
      return {
        success: false,
        error: context.error,
        durationMs,
      };
    }

    return {
      success: true,
      output: context.output,
      durationMs,
    };
  },
});

export type ToolMachine = typeof toolMachine;
export type ToolActorRef = ActorRefFrom<ToolMachine>;
export type {
  ToolMachineContext,
  ToolMachineInput,
  ToolMachineEvents,
  ToolMachineOutput,
  ToolExecutor,
};
