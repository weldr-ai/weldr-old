/**
 * Get the preview URL for a snapshot based on deployment mode
 *
 * In local mode: Uses the local preview proxy at /api/preview/[projectId]/[branchId]
 * In cloud mode: Uses the isolated Fly.io preview URLs at https://[snapshotId].preview.weldr.app
 */
export function getPreviewUrl(
  snapshotId: string,
  projectId: string,
  branchId: string,
  path = "",
): string {
  // Detect local mode by checking if we're on localhost
  const isLocal =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  if (isLocal) {
    // Local mode: use the preview proxy
    const cleanPath = path.replace(/^\//, "");
    const base = `/api/preview/${projectId}/${branchId}`;
    return cleanPath ? `${base}/${cleanPath}` : base;
  }

  // Cloud mode: use the Fly.io preview subdomain
  const base = `https://${snapshotId}.preview.weldr.app`;
  return path ? (path.startsWith("/") ? `${base}${path}` : `${base}/${path}`) : base;
}
