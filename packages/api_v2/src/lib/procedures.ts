import { useAuth } from "@/middlewares/auth";
import { useSentry } from "@/middlewares/sentry";
import { base } from "./context";

export const publicProcedure = base.use(useSentry);

export const protectedProcedure = base.use(useAuth);
