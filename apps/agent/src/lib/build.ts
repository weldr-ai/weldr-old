import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { put as tigrisPut } from "@tigrisdata/storage";

import { Logger } from "@weldr/shared/logger";
import { getBranchDir } from "@weldr/shared/state";

import { runCommand } from "./commands";

interface BuildOptions {
  projectId: string;
  branchId: string;
  versionId: string;
}

interface BuildResult {
  success: boolean;
  artifactUrl?: string;
  error?: string;
}

/**
 * Build an application and upload the artifact to Tigris
 */
export async function build({
  projectId,
  branchId,
  versionId,
}: BuildOptions): Promise<BuildResult> {
  const logger = Logger.get({ projectId, versionId });

  const dir = getBranchDir(projectId, branchId);

  try {
    logger.info("Starting build process", { dir });

    // Install dependencies
    logger.info("Installing dependencies");
    const installResult = await runCommand(
      "bun",
      ["install", "--no-verify", "--no-progress", "--silent"],
      { cwd: dir },
    );

    if (!installResult.success) {
      throw new Error(`Failed to install dependencies: ${installResult.stderr}`);
    }

    // Run build
    logger.info("Running build");
    const buildResult = await runCommand("bun", ["run", "build"], { cwd: dir });

    if (!buildResult.success) {
      throw new Error(`Build failed: ${buildResult.stderr}`);
    }

    logger.info("Build completed successfully");

    // Install production dependencies only
    logger.info("Installing production dependencies");
    const prodInstallResult = await runCommand(
      "bun",
      ["install", "--production", "--no-verify", "--no-progress", "--silent"],
      { cwd: dir },
    );

    if (!prodInstallResult.success) {
      throw new Error(`Failed to install production dependencies: ${prodInstallResult.stderr}`);
    }

    // Determine build output directory and files to include
    let buildDir: string;
    let filesToZip: string[];

    if (existsSync(join(dir, ".output"))) {
      // TanStack Start / Nitro output
      buildDir = ".output";
      filesToZip = [".output/", "node_modules/", "package.json"];
      logger.info("Detected TanStack Start build (.output)");
    } else if (existsSync(join(dir, "dist"))) {
      // Vite/esbuild/tsdown output
      buildDir = "dist";
      filesToZip = ["dist/", "node_modules/", "package.json"];
      logger.info("Detected dist build");
    } else if (existsSync(join(dir, "build"))) {
      // CRA/other build output
      buildDir = "build";
      filesToZip = ["build/", "node_modules/", "package.json"];
      logger.info("Detected build directory");
    } else {
      throw new Error("No build output directory found (.output/, dist/, or build/)");
    }

    // Create zip artifact
    const artifactName = `build-artifact-${versionId}.zip`;
    const artifactPath = `/tmp/${artifactName}`;

    logger.info("Creating build artifact", { artifactName, buildDir });

    const zipResult = await runCommand("zip", ["-r", artifactPath, ...filesToZip, "-q"], {
      cwd: dir,
    });

    if (!zipResult.success) {
      throw new Error(`Failed to create zip artifact: ${zipResult.stderr}`);
    }

    logger.info("Build artifact created successfully", {
      artifactPath,
      files: filesToZip,
    });

    // Upload to Tigris
    const bucketName = "weldr-build-artifacts";
    const objectKey = `project-${projectId}-version-${versionId}.zip`;

    logger.info("Uploading build artifact to Tigris", {
      bucketName,
      objectKey,
    });

    const fileBuffer = readFileSync(artifactPath);

    const uploadResult = await tigrisPut(objectKey, fileBuffer, {
      config: {
        bucket: bucketName,
      },
      allowOverwrite: true,
    });

    if (uploadResult.error) {
      throw uploadResult.error;
    }

    logger.info("Build artifact uploaded successfully", {
      bucketName,
      objectKey,
    });

    // Clean up temporary artifact
    await runCommand("rm", ["-f", artifactPath]);
    logger.info("Cleaned up temporary artifact");

    return {
      success: true,
      artifactUrl: `s3://${bucketName}/${objectKey}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Build process failed", { error: errorMessage });

    return {
      success: false,
      error: errorMessage,
    };
  }
}
