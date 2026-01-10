import { promises as fs } from "node:fs";

import { runCommand } from "@/lib/commands";
import type {
  IntegrationCallbackResult,
  IntegrationPackageSets,
  IntegrationScriptSets,
} from "../types";
import { combineResults } from "./combine-results";

export async function installPackages(
  packagesSets: IntegrationPackageSets,
  branchDir: string,
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

    if (runtimeInstallCommand.length > 0) {
      const runtimeResult = await runCommand(
        "sh",
        ["-c", `bun add ${runtimeInstallCommand.join(" ")} --cwd apps/${target}`],
        {
          cwd: branchDir,
        },
      );

      results.push(runtimeResult);
    }

    if (developmentInstallCommand.length > 0) {
      const developmentResult = await runCommand(
        "sh",
        ["-c", `bun add -D ${developmentInstallCommand.join(" ")} --cwd apps/${target}`],
        {
          cwd: branchDir,
        },
      );

      results.push(developmentResult);
    }
  }

  return combineResults(results);
}

export async function updatePackageJsonScripts(
  scriptSets: IntegrationScriptSets,
  branchDir: string,
): Promise<IntegrationCallbackResult> {
  try {
    const results: IntegrationCallbackResult[] = [];

    for (const scriptSet of scriptSets) {
      const directory =
        scriptSet.target === "root" ? branchDir : `${branchDir}/apps/${scriptSet.target}`;

      let packageJsonContent: {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      } = {};

      try {
        const packageJsonPath = `${directory}/package.json`;
        const fileContent = await fs.readFile(packageJsonPath, "utf-8");
        packageJsonContent = JSON.parse(fileContent);
      } catch (error) {
        console.error("Failed to read package.json:", error);
        return {
          success: false,
          message: `Failed to read package.json: ${error instanceof Error ? error.message : String(error)}`,
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
        const packageJsonPath = `${directory}/package.json`;
        await fs.writeFile(packageJsonPath, JSON.stringify(packageJsonContent, null, 2), "utf-8");
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
    console.error("Error updating package.json:", error);
    return {
      success: false,
      message: `Failed to update package.json scripts: ${error instanceof Error ? error.message : String(error)}`,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export async function runBunScript(
  script: string,
  branchDir: string,
): Promise<IntegrationCallbackResult> {
  const result = await runCommand("bun", ["run", script], {
    cwd: branchDir,
  });

  if (result.success) {
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
