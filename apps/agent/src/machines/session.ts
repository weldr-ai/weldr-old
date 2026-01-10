import { assign, setup, stopChild, type ActorRefFrom } from "xstate";

import { Logger } from "@weldr/shared/logger";

import { cleanupSessionActor } from "@/actors/session/cleanup-session";
import { finalizeSessionActor } from "@/actors/session/finalize-session";
import { initializeSessionActor } from "@/actors/session/initialize-session";
import { markFailedSessionActor } from "@/actors/session/mark-failed-session";
import { stream } from "@/lib/stream-utils";
import { agentMachine } from "@/machines/agent";
import type {
  SessionMachineContext,
  SessionMachineEvents,
  SessionMachineInput,
} from "@/machines/types";

export type {
  BranchWithVersion,
  ProjectWithConfig,
  SessionMachineContext,
  SessionMachineEvents,
  SessionMachineInput,
} from "@/machines/types";

export const sessionMachine = setup({
  types: {
    context: {} as SessionMachineContext,
    events: {} as SessionMachineEvents,
    input: {} as SessionMachineInput,
  },
  actors: {
    initialize: initializeSessionActor,
    finalize: finalizeSessionActor,
    markFailed: markFailedSessionActor,
    cleanup: cleanupSessionActor,
    agentMachine,
  },
  actions: {
    logTransition: ({ context, event }, params: { from: string; to: string }) => {
      const logger = Logger.get({
        projectId: context.project.id,
        branchId: context.branch.id,
        versionId: context.branch.headVersion.id,
        actor: "session-machine",
      });
      logger.info(`Transitioning: ${params.from} -> ${params.to}`, {
        extra: { eventType: event.type },
      });
    },
    assignMessage: assign({
      message: ({ event }) => {
        if (event.type === "START") {
          return event.message ?? null;
        }
        return null;
      },
    }),
    assignError: assign({
      error: ({ event }) => {
        if (event.type === "AGENT_ERROR") {
          return event.error;
        }
        return null;
      },
    }),
    assignInvokeError: assign({
      error: (_, params: { error: unknown }) => {
        if (params.error instanceof Error) {
          return params.error;
        }
        return new Error(String(params.error));
      },
    }),
    assignAgentSetup: assign(
      (_, params: { tools: SessionMachineContext["tools"]; systemPrompt: string }) => ({
        tools: params.tools,
        systemPrompt: params.systemPrompt,
      }),
    ),
    assignAgentRef: assign({
      agentRef: ({ context, spawn }) =>
        spawn("agentMachine", {
          input: {
            project: context.project,
            branch: context.branch,
            user: context.user,
            tools: context.tools,
            systemPrompt: context.systemPrompt,
          },
        }),
    }),
    startAgentActor: ({ context }) => {
      if (context.agentRef) {
        context.agentRef.send({ type: "PROCESS" });
      }
    },
    stopAgentActor: ({ context }) => {
      if (context.agentRef) {
        stopChild(context.agentRef);
      }
    },
    clearAgentRef: assign({
      agentRef: () => null,
    }),
    notifyCancelled: async ({ context }) => {
      const logger = Logger.get({
        projectId: context.project.id,
        branchId: context.branch.id,
        versionId: context.branch.headVersion.id,
        actor: "session-machine",
      });
      logger.info("Session cancelled");

      await stream(context.branch.headVersion.chatId, {
        type: "status",
        status: null,
      });
    },
  },
  guards: {},
}).createMachine({
  id: "session",
  initial: "idle",
  context: ({ input }) => ({
    project: input.project,
    branch: input.branch,
    user: input.user,
    message: null,
    error: null,
    agentRef: null,
    tools: {} as SessionMachineContext["tools"],
    systemPrompt: "",
  }),
  states: {
    idle: {
      on: {
        START: {
          target: "initializing",
          actions: [
            { type: "assignMessage" },
            { type: "logTransition", params: { from: "idle", to: "initializing" } },
          ],
        },
      },
    },

    initializing: {
      invoke: {
        id: "initialize",
        src: "initialize",
        input: ({ context }) => ({ context }),
        onDone: {
          target: "running",
          actions: [
            {
              type: "assignAgentSetup",
              params: ({ event }) => ({
                tools: event.output.tools,
                systemPrompt: event.output.systemPrompt,
              }),
            },
            { type: "logTransition", params: { from: "initializing", to: "running" } },
          ],
        },
        onError: {
          target: "failed",
          actions: [
            {
              type: "assignInvokeError",
              params: ({ event }) => ({ error: event.error }),
            },
            { type: "logTransition", params: { from: "initializing", to: "failed" } },
          ],
        },
      },
      on: {
        CANCEL: {
          target: "cancelled",
          actions: [{ type: "logTransition", params: { from: "initializing", to: "cancelled" } }],
        },
      },
    },

    running: {
      entry: [
        ({ context }) => {
          const logger = Logger.get({
            projectId: context.project.id,
            branchId: context.branch.id,
            versionId: context.branch.headVersion.id,
            actor: "session-machine",
          });
          logger.info("Session running - agent actor will be spawned here");
        },
        { type: "assignAgentRef" },
        { type: "startAgentActor" },
      ],
      on: {
        AGENT_COMPLETE: {
          target: "finalizing",
          actions: [{ type: "logTransition", params: { from: "running", to: "finalizing" } }],
        },
        AGENT_ERROR: {
          target: "failed",
          actions: [
            { type: "assignError" },
            { type: "logTransition", params: { from: "running", to: "failed" } },
          ],
        },
        CANCEL: {
          target: "cancelled",
          actions: [
            { type: "stopAgentActor" },
            { type: "clearAgentRef" },
            { type: "logTransition", params: { from: "running", to: "cancelled" } },
          ],
        },
      },
    },

    finalizing: {
      invoke: {
        id: "finalize",
        src: "finalize",
        input: ({ context }) => ({ context }),
        onDone: {
          target: "completed",
          actions: [{ type: "logTransition", params: { from: "finalizing", to: "completed" } }],
        },
        onError: {
          target: "failed",
          actions: [
            {
              type: "assignInvokeError",
              params: ({ event }) => ({ error: event.error }),
            },
            { type: "logTransition", params: { from: "finalizing", to: "failed" } },
          ],
        },
      },
      on: {
        CANCEL: {
          target: "cancelled",
          actions: [{ type: "logTransition", params: { from: "finalizing", to: "cancelled" } }],
        },
      },
    },

    completed: {
      entry: [
        ({ context }) => {
          const logger = Logger.get({
            projectId: context.project.id,
            branchId: context.branch.id,
            versionId: context.branch.headVersion.id,
            actor: "session-machine",
          });
          logger.info("Session completed successfully");
        },
      ],
      always: {
        target: "cleaningUp",
      },
    },

    failed: {
      invoke: {
        id: "markFailed",
        src: "markFailed",
        input: ({ context }) => ({ context }),
        onDone: {
          target: "#session.cleaningUp",
        },
        onError: {
          target: "#session.cleaningUp",
        },
      },
    },

    cancelled: {
      entry: [{ type: "notifyCancelled" }],
      always: {
        target: "cleaningUp",
      },
    },

    cleaningUp: {
      invoke: {
        id: "cleanup",
        src: "cleanup",
        input: ({ context }) => ({ context }),
        onDone: {
          target: "terminated",
        },
        onError: {
          target: "terminated",
        },
      },
    },

    terminated: {
      type: "final",
      entry: ({ context }) => {
        const logger = Logger.get({
          projectId: context.project.id,
          branchId: context.branch.id,
          versionId: context.branch.headVersion.id,
          actor: "session-machine",
        });
        logger.info("Session terminated", {
          extra: { hadError: context.error !== null },
        });
      },
    },
  },
});

export type SessionMachine = typeof sessionMachine;
export type SessionActorRef = ActorRefFrom<SessionMachine>;
