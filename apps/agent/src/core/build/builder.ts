import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { put as tigrisPut } from "@tigrisdata/storage";

import { Logger } from "@weldr/shared/logger";

import { exec } from "@/core/sandbox";
import { dirExists } from "@/core/sandbox/fs";

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

const WELDR_HOME = path.join(os.homedir(), ".weldr");

/**
 * Build an application and upload the artifact to Tigris.
 * All commands run inside the agentfs virtual directory.
 */
export async function build({
  projectId,
  branchId,
  versionId,
}: BuildOptions): Promise<BuildResult> {
  const logger = Logger.get({ projectId, versionId });

  try {
    logger.info("Starting build process");

    // Install dependencies
    logger.info("Installing dependencies");
    const installResult = await exec("bun install --no-verify --no-progress --silent", {
      projectId,
      branchId,
    });

    if (installResult.exitCode !== 0) {
      throw new Error(`Failed to install dependencies: ${installResult.stderr}`);
    }

    // Run build
    logger.info("Running build");
    const buildResult = await exec("bun run build", { projectId, branchId });

    if (buildResult.exitCode !== 0) {
      throw new Error(`Build failed: ${buildResult.stderr}`);
    }

    logger.info("Build completed successfully");

    // Install production dependencies only
    logger.info("Installing production dependencies");
    const prodInstallResult = await exec(
      "bun install --production --no-verify --no-progress --silent",
      { projectId, branchId },
    );

    if (prodInstallResult.exitCode !== 0) {
      throw new Error(`Failed to install production dependencies: ${prodInstallResult.stderr}`);
    }

    // Determine build output directory and files to include
    let buildDir: string;
    let filesToZip: string[];

    if (dirExists(branchId, "/.output")) {
      // TanStack Start / Nitro output
      buildDir = ".output";
      filesToZip = [".output/", "node_modules/", "package.json"];
      logger.info("Detected TanStack Start build (.output)");
    } else if (dirExists(branchId, "/dist")) {
      // Vite/esbuild/tsdown output
      buildDir = "dist";
      filesToZip = ["dist/", "node_modules/", "package.json"];
      logger.info("Detected dist build");
    } else if (dirExists(branchId, "/build")) {
      // CRA/other build output
      buildDir = "build";
      filesToZip = ["build/", "node_modules/", "package.json"];
      logger.info("Detected build directory");
    } else {
      throw new Error("No build output directory found (.output/, dist/, or build/)");
    }

    // Create zip artifact
    const artifactName = `build-${versionId}.zip`;
    const buildsDir = path.join(WELDR_HOME, "builds");
    const artifactPath = path.join(buildsDir, artifactName);

    mkdirSync(buildsDir, { recursive: true });

    logger.info("Creating build artifact", { artifactName, buildDir });

    const zipResult = await exec(`zip -r ${artifactPath} ${filesToZip.join(" ")} -q`, {
      projectId,
      branchId,
    });

    if (zipResult.exitCode !== 0) {
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
    await exec(`rm -f ${artifactPath}`, { projectId, branchId });
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
