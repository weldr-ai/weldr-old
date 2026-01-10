import type { IntegrationCallbackResult } from "../types";

export function combineResults(results: IntegrationCallbackResult[]): IntegrationCallbackResult {
  const success = results.every((r) => r.success);
  const messages = results.map((r) => r.message).filter(Boolean);
  const installedPackages = results.flatMap((r) => r.installedPackages || []);
  const createdFiles = results.flatMap((r) => r.createdFiles || []);
  const errors = results.flatMap((r) => r.errors || []);

  return {
    success,
    message: messages.join("; "),
    installedPackages,
    createdFiles,
    errors,
  };
}
