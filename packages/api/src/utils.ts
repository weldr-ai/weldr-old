import { TRPCError } from "@trpc/server";

export async function callAgentProxy<T = unknown>(
  endpoint: string,
  body: { projectId: string } & Record<string, unknown>,
  requestHeaders?: Headers,
): Promise<T> {
  // Get base URL from environment or default to localhost
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const proxyUrl = `${baseUrl}/api/proxy`;

  const proxyHeaders = new Headers();
  proxyHeaders.set("content-type", "application/json");

  // Copy headers from the original request, excluding those that shouldn't be copied
  const headersToExclude = new Set([
    "content-length", // Will be set automatically by fetch
    "host", // Should be set by the proxy
    "connection",
    "transfer-encoding",
  ]);

  requestHeaders?.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (!headersToExclude.has(lowerKey)) {
      proxyHeaders.set(key, value);
    }
  });

  // Ensure cookies are included if present
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
    console.error("Agent proxy request failed:", errorData);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: errorData.error || "Agent proxy request failed",
    });
  }

  return response.json() as Promise<T>;
}

/**
 * Check if running in local mode (local development)
 * vs cloud mode (Fly.io infrastructure)
 *
 * Uses WELDR_MODE environment variable:
 * - "local" or unset = local mode
 * - "cloud" = cloud mode
 *
 * Falls back to NODE_ENV if WELDR_MODE is not set for backwards compatibility
 */
export function isLocalMode(): boolean {
  const mode = process.env.WELDR_MODE?.toLowerCase();
  if (mode === "cloud") return false;
  if (mode === "local") return true;
  // Fallback to NODE_ENV for backwards compatibility
  return process.env.NODE_ENV === "development";
}

export function isCloudMode(): boolean {
  return !isLocalMode();
}
