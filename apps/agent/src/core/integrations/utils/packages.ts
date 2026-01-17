import { exec, type ExecOptions } from "@/core/sandbox/exec";
import { getOrCreateSession } from "@/core/sandbox/just-bash/session";
import type {
  IntegrationCallbackResult,
  IntegrationPackageSets,
  IntegrationScriptSets,
} from "../types";
import { combineResults } from "./combine-results";

export async function installPackages(
  packagesSets: IntegrationPackageSets,
  projectId: string,
  snapshotId: string,
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
      projectId,
      snapshotId,
    };

    if (runtimeInstallCommand.length > 0) {
      const runtimeResult = await exec(
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
      const developmentResult = await exec(
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
  projectId: string,
  snapshotId: string,
): Promise<IntegrationCallbackResult> {
  try {
    const session = await getOrCreateSession({
      projectId,
      snapshotId,
    });

    const results: IntegrationCallbackResult[] = [];

    for (const scriptSet of scriptSets) {
      const packageJsonPath =
        scriptSet.target === "root" ? "/package.json" : `/apps/${scriptSet.target}/package.json`;

      let packageJsonContent: {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      } = {};

      let fileContent: string;
      try {
        fileContent = await session.agent.fs.readFile(packageJsonPath, "utf-8");
      } catch (error) {
        return {
          success: false,
          message: `Failed to read package.json: ${error instanceof Error ? error.message : String(error)}`,
          errors: [error instanceof Error ? error.message : String(error)],
        };
      }

      try {
        packageJsonContent = JSON.parse(fileContent);
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

      try {
        await session.agent.fs.writeFile(
          packageJsonPath,
          JSON.stringify(packageJsonContent, null, 2),
        );
      } catch (error) {
        return {
          success: false,
          message: `Failed to write package.json: ${error instanceof Error ? error.message : String(error)}`,
          errors: [error instanceof Error ? error.message : String(error)],
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
  projectId: string,
  snapshotId: string,
): Promise<IntegrationCallbackResult> {
  const result = await exec(`bun run ${script}`, {
    projectId,
    snapshotId,
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
