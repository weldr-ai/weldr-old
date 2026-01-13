import pino from "pino";
import pretty from "pino-pretty";

import { nanoid } from "./nanoid";

const isDevelopment = process.env.NODE_ENV === "development";

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    // Use default pino configuration to include all standard fields
  },
  isDevelopment ? pretty({ colorize: true, singleLine: true }) : undefined,
);

export interface RequestLogContext {
  id: string;
  startTime: number;
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    remoteAddress?: string;
    remotePort?: number;
  };
}

function extractConnectionInfo(request: Request): {
  remoteAddress: string;
  remotePort?: number;
} {
  const remoteAddress =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-client-ip") ||
    "127.0.0.1";

  let remotePort: number | undefined;

  const forwardedPort = request.headers.get("x-forwarded-port");
  if (forwardedPort) {
    remotePort = parseInt(forwardedPort, 10);
  }

  if (!remotePort) {
    const hostHeader = request.headers.get("host");
    if (hostHeader?.includes(":")) {
      const portStr = hostHeader.split(":")[1];
      const parsedPort = parseInt(portStr, 10);
      if (!Number.isNaN(parsedPort)) {
        remotePort = parsedPort;
      }
    }
  }

  if (!remotePort) {
    const url = new URL(request.url);
    if (url.protocol === "https:") {
      remotePort = 443;
    } else if (url.protocol === "http:") {
      remotePort = 80;
    }
  }

  return { remoteAddress, remotePort };
}

function createRequestLogger() {
  return {
    logRequest: (request: Request): RequestLogContext => {
      const id = nanoid();
      const startTime = Date.now();
      const { remoteAddress, remotePort } = extractConnectionInfo(request);

      const headers: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        headers[key] = value;
      });

      const logContext: RequestLogContext = {
        id,
        startTime,
        request: {
          method: request.method,
          url: new URL(request.url).pathname + new URL(request.url).search,
          headers,
          remoteAddress,
          remotePort,
        },
      };

      // Don't log request start, only log completion/error
      return logContext;
    },

    logResponse: (
      context: RequestLogContext,
      response: Response,
      error?: Error,
    ) => {
      const responseTime = Date.now() - context.startTime;

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      if (error) {
        // Use logger.error for errors to match pino-http behavior
        logger.error({
          req: {
            id: context.id,
            method: context.request.method,
            url: context.request.url,
            headers: context.request.headers,
            remoteAddress: context.request.remoteAddress,
            remotePort: context.request.remotePort,
          },
          res: {
            statusCode: response.status,
            headers: responseHeaders,
          },
          err: {
            type: error.constructor.name,
            message: error.message,
            stack: error.stack,
          },
          responseTime,
          msg: "request errored",
        });
      } else {
        // Use logger.info for successful requests
        logger.info({
          req: {
            id: context.id,
            method: context.request.method,
            url: context.request.url,
            headers: context.request.headers,
            remoteAddress: context.request.remoteAddress,
            remotePort: context.request.remotePort,
          },
          res: {
            statusCode: response.status,
            headers: responseHeaders,
          },
          responseTime,
          msg: "request completed",
        });
      }
    },
  };
}

export async function logRequest(
  request: Request,
  handler: (request: Request) => Promise<Response>,
): Promise<Response> {
  const requestLogger = createRequestLogger();
  const context = requestLogger.logRequest(request);

  try {
    const response = await handler(request);
    requestLogger.logResponse(context, response);
    return response;
  } catch (error) {
    const errorResponse = new Response("Internal Server Error", {
      status: 500,
    });
    requestLogger.logResponse(context, errorResponse, error as Error);
    throw error;
  }
}
