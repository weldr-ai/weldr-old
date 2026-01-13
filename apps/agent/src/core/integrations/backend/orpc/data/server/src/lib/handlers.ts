import { experimental_SmartCoercionPlugin as SmartCoercionPlugin } from "@orpc/json-schema";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { RPCHandler } from "@orpc/server/fetch";
import {
  BatchHandlerPlugin,
  CORSPlugin,
  ResponseHeadersPlugin,
} from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";

import { router } from "@repo/server/router";

const sharedPlugins = [
  new BatchHandlerPlugin(),
  new ResponseHeadersPlugin(),
  new CORSPlugin({
    origin: process.env.CORS_ORIGIN?.split(","),
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }),
  new SmartCoercionPlugin({
    schemaConverters: [new ZodToJsonSchemaConverter()],
  }),
];

export const openApiHandlerOptions = {
  plugins: [
    ...sharedPlugins,
    new OpenAPIReferencePlugin({
      docsPath: "/reference",
      schemaConverters: [new ZodToJsonSchemaConverter()],
      specGenerateOptions: {
        info: {
          title: "API Reference",
          version: "1.0.0",
        },
      },
    }),
  ],
};

export const openApiHandler = new OpenAPIHandler(router, openApiHandlerOptions);

export const rpcHandlerOptions = {
  plugins: [...sharedPlugins],
};

export const rpcHandler = new RPCHandler(router, rpcHandlerOptions);
