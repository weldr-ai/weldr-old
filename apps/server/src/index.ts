import { auth } from "@weldr/auth";

import { corsConfig, openApiHandler, rpcHandler } from "./lib/handlers";

function getCorsHeaders(origin: string | null): Record<string, string> {
  const isAllowed = origin && corsConfig.origin.includes(origin);

  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : corsConfig.origin.join(","),
    "Access-Control-Allow-Methods": corsConfig.allowMethods.join(","),
    "Access-Control-Allow-Headers": corsConfig.allowHeaders.join(","),
    "Access-Control-Allow-Credentials": String(corsConfig.credentials),
    "Access-Control-Max-Age": String(corsConfig.maxAge),
  };
}

function addCorsHeaders(response: Response, origin: string | null): Response {
  const headers = getCorsHeaders(origin);
  const newHeaders = new Headers(response.headers);

  for (const [key, value] of Object.entries(headers)) {
    newHeaders.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

export async function fetch(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");

  if (url.pathname === "/health" || url.pathname === "/ready") {
    const result = await openApiHandler.handle(request, {
      prefix: "/",
      context: {},
    });

    if (result.matched) {
      return result.response;
    }
  }

  if (url.pathname.startsWith("/rpc")) {
    const result = await rpcHandler.handle(request, {
      prefix: "/rpc",
      context: {},
    });

    if (result.matched) {
      return result.response;
    }

    return new Response("Not found", { status: 404 });
  }

  if (url.pathname.startsWith("/api/auth")) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(origin),
      });
    }

    const response = await auth.handler(request);
    return addCorsHeaders(response, origin);
  }

  if (url.pathname.startsWith("/api")) {
    const result = await openApiHandler.handle(request, {
      prefix: "/api",
      context: {},
    });

    if (result.matched) {
      return result.response;
    }

    return new Response("Not found", { status: 404 });
  }

  return new Response("Not found", { status: 404 });
}
