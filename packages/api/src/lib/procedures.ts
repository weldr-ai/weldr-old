import { useAuth } from "../middlewares/auth";
import { retry } from "../middlewares/retry";
import { useSentry } from "../middlewares/sentry";
import { base } from "./context";

const _base = base.use(retry({ maxAttempts: 3 })).use(useSentry);

export const publicProcedure = _base;

export const protectedProcedure = _base.use(useAuth);
