import { fromPromise } from "xstate";

import { stream } from "@/core/stream";
import type { SessionMachineContext } from "@/session/types";

export const notifyCancelledActor = fromPromise<void, { context: SessionMachineContext }>(
  async ({ input }) => {
    const { chatId } = input.context;

    await stream(chatId, {
      type: "status",
      status: null,
    });
  },
);
