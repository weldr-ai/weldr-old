import { put as tigrisPut } from "@tigrisdata/storage";

import { Logger } from "@weldr/shared/logger";

import { exec } from "@/core/workspace";
import { getOrCreateWorkspace, type WorkspaceSession } from "@/core/workspace/just-bash/session";

async function checkDirExists(session: WorkspaceSession, dirPath: string): Promise<boolean> {
  try {
    const stat = await session.agent.fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

interface BuildOptions {
  projectId: string;
  snapshotId: string;
}

interface BuildResult {
  success: boolean;
  artifactUrl?: string;
  error?: string;
}

/**
 * Build an application and upload the artifact to Tigris.
 * All commands run inside the agentfs virtual directory.
 */
export async function build({ projectId, snapshotId }: BuildOptions): Promise<BuildResult> {
  const logger = Logger.get({ projectId, snapshotId });

  try {
    logger.info("Starting build process");

    // Get or create workspace
    const session = await getOrCreateWorkspace({ projectId, snapshotId });

    // Install dependencies
    logger.info("Installing dependencies");
    const installResult = await exec("bun install --no-verify --no-progress --silent", {
      projectId,
      snapshotId,
    });

    if (installResult.exitCode !== 0) {
      throw new Error(`Failed to install dependencies: ${installResult.stderr}`);
    }

    // Run build
    logger.info("Running build");
    const buildResult = await exec("bun run build", { projectId, snapshotId });

    if (buildResult.exitCode !== 0) {
      throw new Error(`Build failed: ${buildResult.stderr}`);
    }

    logger.info("Build completed successfully");

    // Install production dependencies only
    logger.info("Installing production dependencies");
    const prodInstallResult = await exec(
      "bun install --production --no-verify --no-progress --silent",
      { projectId, snapshotId },
    );

    if (prodInstallResult.exitCode !== 0) {
      throw new Error(`Failed to install production dependencies: ${prodInstallResult.stderr}`);
    }

    // Determine build output directory and files to include
    let buildDir: string;
    let filesToZip: string[];

    if (await checkDirExists(session, "/.output")) {
      // TanStack Start / Nitro output
      buildDir = ".output";
      filesToZip = [".output/", "node_modules/", "package.json"];
      logger.info("Detected TanStack Start build (.output)");
    } else if (await checkDirExists(session, "/dist")) {
      // Vite/esbuild/tsdown output
      buildDir = "dist";
      filesToZip = ["dist/", "node_modules/", "package.json"];
      logger.info("Detected dist build");
    } else if (await checkDirExists(session, "/build")) {
      // CRA/other build output
      buildDir = "build";
      filesToZip = ["build/", "node_modules/", "package.json"];
      logger.info("Detected build directory");
    } else {
      throw new Error("No build output directory found (.output/, dist/, or build/)");
    }

    // Create zip artifact in workspace
    const artifactName = `build-${snapshotId}.zip`;

    logger.info("Creating build artifact", { artifactName, buildDir });

    const zipResult = await exec(`zip -r ${artifactName} ${filesToZip.join(" ")} -q`, {
      projectId,
      snapshotId,
    });

    if (zipResult.exitCode !== 0) {
      throw new Error(`Failed to create zip artifact: ${zipResult.stderr}`);
    }

    logger.info("Build artifact created successfully", {
      artifactName,
      files: filesToZip,
    });

    // Upload to Tigris
    const bucketName = "weldr-build-artifacts";
    const objectKey = `project-${projectId}-snapshot-${snapshotId}.zip`;

    logger.info("Uploading build artifact to Tigris", {
      bucketName,
      objectKey,
    });

    // Read the artifact from the workspace filesystem
    const fileBuffer = await session.agent.fs.readFile(`/${artifactName}`);

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

    // Clean up temporary artifact from workspace filesystem
    await session.agent.fs.unlink(`/${artifactName}`);
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
