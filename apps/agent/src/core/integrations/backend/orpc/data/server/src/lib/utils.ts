import { os } from "@orpc/server";

import type { ORPCContext } from "./context";

export const base = os.$context<ORPCContext>();

export const publicProcedure = base;
