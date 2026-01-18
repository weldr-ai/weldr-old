import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { BatchLinkPlugin, DedupeRequestsPlugin } from "@orpc/client/plugins";
import { createRouterClient } from "@orpc/server";
import { createTanstackQueryUtils, type RouterUtils } from "@orpc/tanstack-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { type RouterClient, router } from "@weldr/api";

export type ORPCReactUtils = RouterUtils<RouterClient>;

const getORPCClient = createIsomorphicFn()
  .server(() =>
    createRouterClient(router, {
      context: () => ({
        headers: getRequestHeaders(),
      }),
    }),
  )
  .client((): RouterClient => {
    const link = new RPCLink({
      url: `${import.meta.env.VITE_SERVER_URL ?? "http://localhost:8080"}/rpc`,
      fetch: (url, init) => fetch(url, { ...init, credentials: "include" }),
      plugins: [
        new BatchLinkPlugin({
          groups: [
            {
              condition: () => true,
              context: {},
            },
          ],
        }),
        new DedupeRequestsPlugin({
          groups: [
            {
              condition: () => true,
              context: {},
            },
          ],
        }),
      ],
    });

    return createORPCClient(link);
  });

export const api: RouterClient = getORPCClient();

export const orpc = createTanstackQueryUtils(api);
