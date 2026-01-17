import { openApiHandler, rpcHandler } from "./lib/handlers";
import { logger, logRequest } from "./lib/logger";

export default {
  async fetch(request: Request): Promise<Response> {
    return logRequest(request, async (req) => {
      const url = new URL(req.url);

      if (url.pathname.startsWith("/rpc")) {
        const result = await rpcHandler.handle(req, {
          prefix: "/rpc",
          context: {
            logger,
            headers: new Headers(req.headers as HeadersInit),
          },
        });

        if (result.matched) {
          return result.response;
        }

        return new Response("Not found", { status: 404 });
      }

      if (url.pathname.startsWith("/api")) {
        const result = await openApiHandler.handle(req, {
          prefix: "/api",
          context: {
            logger,
            headers: new Headers(req.headers as HeadersInit),
          },
        });

        if (result.matched) {
          return result.response;
        }

        return new Response("Not found", { status: 404 });
      }

      return new Response("Not found", { status: 404 });
    });
  },
};
