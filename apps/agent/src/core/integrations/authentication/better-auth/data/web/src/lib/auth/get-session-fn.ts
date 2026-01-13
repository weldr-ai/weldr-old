import { createServerFn } from "@tanstack/react-start";
import { getHeaders } from "@tanstack/react-start/server";

import { auth } from "@repo/server/lib/auth";

export const getSessionFn = createServerFn({ method: "POST" }).handler(
  async () => {
    const session = await auth.api.getSession({
      headers: new Headers(getHeaders() as HeadersInit),
    });
    return session ?? null;
  },
);
