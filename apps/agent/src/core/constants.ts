import path from "node:path";

// Agent-specific constants (not workspace-related)
export const MAX_VOLUME_USAGE_PERCENT = 85;
export const TARGET_VOLUME_USAGE_PERCENT = 70;
export const VOLUME_SIZE_GB = 20;

/**
 * Resolve script path based on environment
 * Development: use local scripts directory
 * Production: use installed scripts in /usr/local/bin
 */
export function resolveScriptPath(scriptName: string): string {
  return process.env.NODE_ENV === "development"
    ? path.join(process.cwd(), "scripts", scriptName)
    : `/usr/local/bin/${scriptName}`;
}
