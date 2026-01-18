import { env } from "process";

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { BatchLinkPlugin, DedupeRequestsPlugin } from "@orpc/client/plugins";
import { createTanstackQueryUtils, type RouterUtils } from "@orpc/tanstack-query";

import type { RouterClient } from "@weldr/api";

export type ORPCReactUtils = RouterUtils<RouterClient>;

declare global {
  var $api: RouterClient | undefined;
}

export const link = new RPCLink({
  url: `${env.NEXT_PUBLIC_SERVER_URL}/rpc`,
  fetch(url, options) {
    return fetch(url, {
      ...options,
      credentials: "include",
    });
  },
  headers: async () => {
    if (typeof window !== "undefined") {
      return {};
    }
    const { headers } = await import("next/headers");
    return Object.fromEntries(await headers());
  },
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

export const api: RouterClient = globalThis.$api ?? createORPCClient(link);

export const orpc = createTanstackQueryUtils(api);
