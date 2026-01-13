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
