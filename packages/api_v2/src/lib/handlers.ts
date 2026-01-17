import { LoggingHandlerPlugin } from "@orpc/experimental-pino";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { CompressionPlugin, RPCHandler } from "@orpc/server/fetch";
import {
  BatchHandlerPlugin,
  CORSPlugin,
  RequestHeadersPlugin,
  ResponseHeadersPlugin,
} from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import type { Logger } from "pino";

import { auth } from "@weldr/auth";
import { nanoid } from "@weldr/shared/nanoid";

import { router } from "@/router";

export interface CorsConfig {
  origin: string[];
  allowHeaders: string[];
  allowMethods: string[];
  exposeHeaders: string[];
  maxAge: number;
  credentials: boolean;
}

export interface HandlersOptions {
  corsOrigin: string;
  apiUrl: string;
  port: string;
  isDevelopment: boolean;
  logger: Logger;
}

export function createCorsConfig(corsOrigin: string): CorsConfig {
  return {
    origin: corsOrigin.split(","),
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  };
}

export function createHandlers(options: HandlersOptions) {
  const { corsOrigin, apiUrl, port, isDevelopment, logger } = options;

  const corsConfig = createCorsConfig(corsOrigin);
  const corsPlugin = new CORSPlugin(corsConfig);

  const commonPlugins = [
    corsPlugin,
    new BatchHandlerPlugin(),
    new RequestHeadersPlugin(),
    new ResponseHeadersPlugin(),
    new CompressionPlugin(),
    new LoggingHandlerPlugin({
      logger,
      generateId: () => nanoid(),
      logRequestResponse: !isDevelopment,
      logRequestAbort: true,
    }),
  ];

  const openApiHandler = new OpenAPIHandler(router, {
    plugins: [
      new OpenAPIReferencePlugin({
        docsPath: "/reference",
        schemaConverters: [new ZodToJsonSchemaConverter()],
        specGenerateOptions: async () => {
          const authSchema = await auth.api.generateOpenAPISchema();

          const authPaths = Object.fromEntries(
            Object.entries(authSchema.paths).map(([path, methods]) => [
              `/auth${path}`,
              Object.fromEntries(
                Object.entries(methods as Record<string, unknown>).map(([method, operation]) => [
                  method,
                  { ...(operation as object), tags: ["Authentication"] },
                ]),
              ),
            ]),
          );

          return {
            info: {
              title: "API Reference",
              version: "1.0.0",
            },
            servers: [
              {
                url: apiUrl ?? `http://localhost:${port}`,
                description: "API Server",
              },
            ],
            tags: [{ name: "Authentication", description: "Authentication endpoints" }],
            paths: authPaths,
            components: authSchema.components as Record<string, unknown>,
          };
        },
      }),
      ...commonPlugins,
    ],
  });

  const rpcHandler = new RPCHandler(router, {
    plugins: [...commonPlugins],
  });

  return {
    openApiHandler,
    rpcHandler,
    corsConfig,
  };
}
