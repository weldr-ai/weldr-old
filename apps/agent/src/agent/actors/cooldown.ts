import { fromPromise } from "xstate";

export const cooldownActor = fromPromise<void, { ms: number }>(async ({ input }) => {
  await new Promise((resolve) => setTimeout(resolve, input.ms));
});
