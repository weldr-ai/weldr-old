import { createServer } from "node:http";
import { OpenAPIHandler } from "@orpc/openapi/node";
import { RPCHandler } from "@orpc/server/node";
import pinoHttp from "pino-http";

import { openApiHandlerOptions, rpcHandlerOptions } from "./lib/handlers";
import { logger } from "./lib/logger";
import { nanoid } from "./lib/nanoid";
import { router } from "./router";

const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.headers["x-request-id"] || nanoid(),
});

const openApiHandler = new OpenAPIHandler(router, openApiHandlerOptions);
const rpcHandler = new RPCHandler(router, rpcHandlerOptions);

const server = createServer(async (req, res) => {
  httpLogger(req, res);

  if (req.url?.startsWith("/rpc")) {
    const result = await rpcHandler.handle(req, res, {
      prefix: "/rpc",
      context: {
        logger,
        headers: new Headers(req.headers as HeadersInit),
      },
    });

    if (result.matched) {
      return;
    }
  }

  if (req.url?.startsWith("/api")) {
    const result = await openApiHandler.handle(req, res, {
      prefix: "/api",
      context: {
        logger,
        headers: new Headers(req.headers as HeadersInit),
      },
    });

    if (result.matched) {
      return;
    }
  }

  res.statusCode = 404;
  res.end("Not found");
});

const port = Number(process.env.PORT ?? 3000);

server.listen(port, "0.0.0.0", () =>
  console.log(`Listening on http://localhost:${port}`),
);
