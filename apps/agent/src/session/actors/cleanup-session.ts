import { fromPromise } from "xstate";

import { stream } from "@/core/stream";
import type { SessionMachineContext } from "@/session/types";

export const cleanupSessionActor = fromPromise<void, { context: SessionMachineContext }>(
  async ({ input }) => {
    const { branch } = input.context;

    await stream(branch.headVersion.chatId, {
      type: "end",
    });
  },
);
