import "server-only";
import { StandardRPCJsonSerializer } from "@orpc/client/standard";
import { QueryClient } from "@tanstack/react-query";
import { cache } from "react";

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

// Cache the query client per request using React cache
export const getQueryClient = cache(makeQueryClient);
