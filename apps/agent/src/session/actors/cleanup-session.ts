import { fromPromise } from "xstate";

import { stream } from "@/core/stream";
import type { SessionMachineContext } from "@/session/types";

export const cleanupSessionActor = fromPromise<void, { context: SessionMachineContext }>(
  async ({ input }) => {
    const { chatId } = input.context;

    await stream(chatId, {
      type: "end",
    });
  },
);
