import { ORPCError } from "@orpc/server";

import { Logger } from "@weldr/shared/logger";

export async function callAgentProxy<T = unknown>(
  endpoint: string,
  body: { projectId: string } & Record<string, unknown>,
  requestHeaders?: Headers,
): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const proxyUrl = `${baseUrl}/api/proxy`;

  const proxyHeaders = new Headers();
  proxyHeaders.set("content-type", "application/json");

  const headersToExclude = new Set(["content-length", "host", "connection", "transfer-encoding"]);

  requestHeaders?.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (!headersToExclude.has(lowerKey)) {
      proxyHeaders.set(key, value);
    }
  });

  const cookie = requestHeaders?.get("cookie");
  if (cookie) {
    proxyHeaders.set("cookie", cookie);
  }

  const response = await fetch(proxyUrl, {
    method: "POST",
    headers: proxyHeaders,
    body: JSON.stringify({
      endpoint,
      ...body,
    }),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { error?: string };
    Logger.error("Agent proxy request failed", { errorData, endpoint });
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: errorData.error || "Agent proxy request failed",
    });
  }

  return response.json() as Promise<T>;
}

export function isLocalMode(): boolean {
  const mode = process.env.WELDR_MODE?.toLowerCase();
  if (mode === "cloud") return false;
  if (mode === "local") return true;
  return process.env.NODE_ENV === "development";
}

export function isCloudMode(): boolean {
  return !isLocalMode();
}
