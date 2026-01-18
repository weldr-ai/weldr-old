"use client";

import { StandardRPCJsonSerializer } from "@orpc/client/standard";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

const serializer = new StandardRPCJsonSerializer();

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn(queryKey) {
          const [json, meta] = serializer.serialize(queryKey);
          return JSON.stringify({ json, meta });
        },
        staleTime: 60 * 1000,
      },
      dehydrate: {
        serializeData(data) {
          const [json, meta] = serializer.serialize(data);
          return { json, meta };
        },
      },
      hydrate: {
        deserializeData(data) {
          return serializer.deserialize(data.json, data.meta);
        },
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return makeQueryClient();
  }
  // Browser: make a new query client if we don't already have one
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }

  return browserQueryClient;
}

export function Provider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => getQueryClient());
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
