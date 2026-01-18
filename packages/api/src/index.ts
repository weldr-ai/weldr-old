import type {
  InferRouterInputs,
  InferRouterOutputs,
  RouterClient as ORPCRouterClient,
} from "@orpc/server";

import { router } from "./router";

export { createHandlers } from "./lib/handlers";
export { router };
export type Router = typeof router;
export type RouterClient = ORPCRouterClient<Router>;
export type RouterInputs = InferRouterInputs<typeof router>;
export type RouterOutputs = InferRouterOutputs<typeof router>;
