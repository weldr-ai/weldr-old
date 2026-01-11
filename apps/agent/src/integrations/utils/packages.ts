import { exec, type ExecOptions } from "@/lib/sandbox/exec";
import { readFile, writeFile } from "@/lib/sandbox/fs";
import type {
  IntegrationCallbackResult,
  IntegrationPackageSets,
  IntegrationScriptSets,
} from "../types";
import { combineResults } from "./combine-results";

export async function installPackages(
  packagesSets: IntegrationPackageSets,
  sessionId: string,
  projectId: string,
): Promise<IntegrationCallbackResult> {
  const results: IntegrationCallbackResult[] = [];

  for (const packages of packagesSets) {
    const runtimePackages = Object.entries(packages.runtime);
    const developmentPackages = Object.entries(packages.development);

    const runtimeInstallCommand = runtimePackages.map(([name, version]) =>
      version ? `${name}@${version}` : name,
    );

    const developmentInstallCommand = developmentPackages.map(([name, version]) =>
      version ? `${name}@${version}` : name,
    );

    const target = packages.target;

    const execOptions: ExecOptions = {
      branchId: sessionId,
      projectId,
    };

    if (runtimeInstallCommand.length > 0) {
      const runtimeResult = exec(
        `bun add ${runtimeInstallCommand.join(" ")} --cwd apps/${target}`,
        execOptions,
      );

      results.push({
        success: runtimeResult.exitCode === 0,
        message:
          runtimeResult.exitCode === 0
            ? `Successfully installed runtime packages for ${target}`
            : `Failed to install runtime packages: ${runtimeResult.stderr}`,
        errors: runtimeResult.exitCode !== 0 ? [runtimeResult.stderr] : undefined,
      });
    }

    if (developmentInstallCommand.length > 0) {
      const developmentResult = exec(
        `bun add -D ${developmentInstallCommand.join(" ")} --cwd apps/${target}`,
        execOptions,
      );

      results.push({
        success: developmentResult.exitCode === 0,
        message:
          developmentResult.exitCode === 0
            ? `Successfully installed development packages for ${target}`
            : `Failed to install development packages: ${developmentResult.stderr}`,
        errors: developmentResult.exitCode !== 0 ? [developmentResult.stderr] : undefined,
      });
    }
  }

  return combineResults(results);
}

export async function updatePackageJsonScripts(
  scriptSets: IntegrationScriptSets,
  sessionId: string,
): Promise<IntegrationCallbackResult> {
  try {
    const results: IntegrationCallbackResult[] = [];

    for (const scriptSet of scriptSets) {
      const packageJsonPath =
        scriptSet.target === "root" ? "/package.json" : `/apps/${scriptSet.target}/package.json`;

      let packageJsonContent: {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      } = {};

      const readResult = readFile(sessionId, packageJsonPath);
      if (!readResult.success || readResult.data === undefined) {
        return {
          success: false,
          message: `Failed to read package.json: ${readResult.error ?? "Unknown error"}`,
          errors: [readResult.error ?? "Unknown error"],
        };
      }

      try {
        packageJsonContent = JSON.parse(readResult.data);
      } catch (error) {
        return {
          success: false,
          message: `Failed to parse package.json: ${error instanceof Error ? error.message : String(error)}`,
          errors: [error instanceof Error ? error.message : String(error)],
        };
      }

      if (scriptSet.scripts) {
        packageJsonContent.scripts = {
          ...packageJsonContent.scripts,
          ...scriptSet.scripts,
        };
      }

      const writeResult = writeFile(
        sessionId,
        packageJsonPath,
        JSON.stringify(packageJsonContent, null, 2),
      );
      if (!writeResult.success) {
        return {
          success: false,
          message: `Failed to write package.json: ${writeResult.error ?? "Unknown error"}`,
          errors: [writeResult.error ?? "Unknown error"],
        };
      }

      results.push({
        success: true,
        message: `Successfully updated ${scriptSet.target} package.json scripts`,
      });
    }

    return combineResults(results);
  } catch (error) {
    return {
      success: false,
      message: `Failed to update package.json scripts: ${error instanceof Error ? error.message : String(error)}`,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export async function runBunScript(
  script: string,
  sessionId: string,
  projectId: string,
): Promise<IntegrationCallbackResult> {
  const result = exec(`bun run ${script}`, {
    branchId: sessionId,
    projectId,
  });

  if (result.exitCode === 0) {
    return {
      success: true,
      message: `Successfully ran script: ${script}`,
    };
  }

  return {
    success: false,
    message: `Failed to run script ${script}: ${result.stderr}`,
    errors: [result.stderr],
  };
}
