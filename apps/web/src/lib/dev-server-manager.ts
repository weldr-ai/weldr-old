import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  DEV_SERVERS_FILE,
  type DevServerMetadata,
  type DevServersState,
  getBranchDir,
  trackProjectActivity,
} from "@weldr/shared/state";

// Port range: 9000-9009 (10 ports total)
const PORT_RANGE_START = 9000;
const PORT_RANGE_END = 9009;
const MAX_SERVERS = 10;

// Track running processes in memory
const runningProcesses = new Map<string, ChildProcess>();

const METADATA_FILE = DEV_SERVERS_FILE;

/**
 * Load dev servers metadata from disk
 */
function loadMetadata(): DevServersState {
  try {
    if (existsSync(METADATA_FILE)) {
      const content = readFileSync(METADATA_FILE, "utf-8");
      return JSON.parse(content) as DevServersState;
    }
  } catch (error) {
    console.warn("Failed to load dev servers metadata", error);
  }
  return { servers: [] };
}

/**
 * Save dev servers metadata to disk
 */
async function saveMetadata(state: DevServersState): Promise<void> {
  try {
    await writeFile(METADATA_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to save dev servers metadata", error);
  }
}

/**
 * Get available port from pool
 */
function getAvailablePort(state: DevServersState): number | null {
  const usedPorts = new Set(state.servers.map((s) => s.port));

  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (!usedPorts.has(port)) {
      return port;
    }
  }

  return null;
}

/**
 * Get server key for tracking
 */
function getServerKey(projectId: string, branchId: string): string {
  return `${projectId}:${branchId}`;
}

/**
 * Check if a process is still running
 */
function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for server to be ready by polling the port
 */
async function waitForServer(port: number, maxAttempts = 60): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await fetch(`http://localhost:${port}`, {
        signal: AbortSignal.timeout(1000),
      });
      // Server responded (even with error status), it's ready
      console.log(
        `Dev server on port ${port} is ready (attempt ${attempt + 1})`,
      );
      return true;
    } catch {
      // Server not ready yet, wait and retry
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.error(`Dev server on port ${port} failed to become ready`);
  return false;
}

/**
 * Detect framework and return appropriate dev command
 */
function detectFramework(branchDir: string): {
  command: string;
  cwd: string;
} {
  // Check for monorepo structure with apps/web
  const webPackageJsonPath = join(branchDir, "apps", "web", "package.json");
  const serverPackageJsonPath = join(
    branchDir,
    "apps",
    "server",
    "package.json",
  );
  const rootPackageJsonPath = join(branchDir, "package.json");

  // Prefer web app if it exists
  if (existsSync(webPackageJsonPath)) {
    const webPackageJson = JSON.parse(
      readFileSync(webPackageJsonPath, "utf-8"),
    );
    console.log("Detected web app structure");

    // Check for TanStack Start
    if (webPackageJson.dependencies?.["@tanstack/react-start"]) {
      console.log("Detected TanStack Start framework");
      return {
        command: "bun dev",
        cwd: join(branchDir, "apps", "web"),
      };
    }

    // Check for Next.js
    if (webPackageJson.dependencies?.next) {
      console.log("Detected Next.js framework");
      return {
        command: "bun dev",
        cwd: join(branchDir, "apps", "web"),
      };
    }
  }

  // Check for standalone server app
  if (existsSync(serverPackageJsonPath)) {
    console.log("Detected server app structure");
    return {
      command: "bun dev",
      cwd: join(branchDir, "apps", "server"),
    };
  }

  // Fallback to root
  if (existsSync(rootPackageJsonPath)) {
    console.log("Using root package.json");
    return {
      command: "bun dev",
      cwd: branchDir,
    };
  }

  console.warn("No package.json found, using fallback");
  return {
    command: "bun dev",
    cwd: branchDir,
  };
}

/**
 * Get LRU server for eviction
 */
function getLRUServer(state: DevServersState): DevServerMetadata | null {
  if (state.servers[0] === undefined) {
    return null;
  }

  let lruServer = state.servers[0];
  for (const server of state.servers) {
    if (server.lastAccessed < lruServer.lastAccessed) {
      lruServer = server;
    }
  }

  return lruServer;
}

/**
 * Kill a dev server process
 */
async function killProcess(
  projectId: string,
  branchId: string,
  pid: number,
): Promise<void> {
  const key = getServerKey(projectId, branchId);

  try {
    const childProcess = runningProcesses.get(key);
    if (childProcess) {
      childProcess.kill("SIGTERM");
      runningProcesses.delete(key);
      console.log(`Sent SIGTERM to dev server process ${pid}`);

      // Wait a bit, then force kill if needed
      await new Promise((resolve) => setTimeout(resolve, 2000));

      if (isProcessRunning(pid)) {
        process.kill(pid, "SIGKILL");
        console.warn(`Force killed dev server ${pid} with SIGKILL`);
      }
    } else {
      // Process not tracked, try to kill by PID
      if (isProcessRunning(pid)) {
        process.kill(pid, "SIGTERM");
        console.log(`Sent SIGTERM to untracked process ${pid}`);

        await new Promise((resolve) => setTimeout(resolve, 2000));

        if (isProcessRunning(pid)) {
          process.kill(pid, "SIGKILL");
          console.warn(`Force killed untracked process ${pid} with SIGKILL`);
        }
      }
    }
  } catch (error) {
    console.error(`Failed to kill dev server process ${pid}`, error);
  }
}

/**
 * Stop a dev server
 */
export async function stopDevServer(
  projectId: string,
  branchId: string,
): Promise<void> {
  console.log(`Stopping dev server for ${projectId}/${branchId}`);

  const state = loadMetadata();
  const serverIndex = state.servers.findIndex(
    (s) => s.projectId === projectId && s.branchId === branchId,
  );

  if (serverIndex === -1 || state.servers[serverIndex] === undefined) {
    console.warn("Dev server not found in metadata");
    return;
  }

  const server = state.servers[serverIndex];
  await killProcess(projectId, branchId, server.pid);

  // Remove from metadata
  state.servers.splice(serverIndex, 1);
  await saveMetadata(state);

  console.log("Dev server stopped");
}

/**
 * Start a dev server for a branch
 */
export async function startDevServer(
  projectId: string,
  branchId: string,
): Promise<{ port: number; status: "running" | "starting" | "error" }> {
  console.log(`Starting dev server for ${projectId}/${branchId}`);

  const state = loadMetadata();
  const key = getServerKey(projectId, branchId);

  // Check if already running
  const existing = state.servers.find(
    (s) => s.projectId === projectId && s.branchId === branchId,
  );

  if (existing) {
    // Verify process is still alive
    if (isProcessRunning(existing.pid)) {
      console.log(`Dev server already running on port ${existing.port}`);
      return { port: existing.port, status: "running" };
    }

    // Process died, clean up metadata
    console.warn("Dev server process died, cleaning up");
    const index = state.servers.findIndex(
      (s) => s.projectId === projectId && s.branchId === branchId,
    );
    state.servers.splice(index, 1);
    runningProcesses.delete(key);
  }

  // Check capacity and evict LRU if needed
  if (state.servers.length >= MAX_SERVERS) {
    const lruServer = getLRUServer(state);
    if (lruServer !== null) {
      console.log(
        `At capacity, evicting LRU server: ${lruServer.projectId}/${lruServer.branchId} on port ${lruServer.port}`,
      );
      await stopDevServer(lruServer.projectId, lruServer.branchId);
      // Reload state after eviction
      state.servers = loadMetadata().servers;
    }
  }

  // Get available port
  const port = getAvailablePort(state);
  if (port === null) {
    console.error("No available ports");
    return { port: 0, status: "error" };
  }

  // Detect framework and get command
  const branchDir = getBranchDir(projectId, branchId);
  const { command, cwd } = detectFramework(branchDir);

  // Track project activity
  await trackProjectActivity(projectId, branchId);

  console.log(`Detected framework: ${command} in ${cwd}, port: ${port}`);

  // Spawn dev server process
  try {
    const [cmd, ...args] = command.split(" ");
    const childProcess = spawn(cmd ?? "bun", args, {
      cwd,
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: "development",
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    if (!childProcess.pid) {
      console.error("Failed to spawn dev server process");
      return { port: 0, status: "error" };
    }

    const pid = childProcess.pid;

    // Log output for debugging
    childProcess.stdout?.on("data", (data: Buffer) => {
      console.log(`[Dev Server ${port}]`, data.toString().trim());
    });

    childProcess.stderr?.on("data", (data: Buffer) => {
      console.warn(`[Dev Server ${port} Error]`, data.toString().trim());
    });

    childProcess.on(
      "exit",
      (code: number | null, signal: NodeJS.Signals | null) => {
        console.log(
          `Dev server process ${pid} exited with code ${code}, signal ${signal}`,
        );
        runningProcesses.delete(key);

        // Clean up metadata
        const currentState = loadMetadata();
        const index = currentState.servers.findIndex(
          (s) => s.projectId === projectId && s.branchId === branchId,
        );
        if (index !== -1) {
          currentState.servers.splice(index, 1);
          saveMetadata(currentState);
        }
      },
    );

    // Track process
    runningProcesses.set(key, childProcess);

    // Save metadata
    const serverMetadata: DevServerMetadata = {
      projectId,
      branchId,
      port,
      pid,
      lastAccessed: Date.now(),
      startedAt: Date.now(),
      command,
    };

    state.servers.push(serverMetadata);
    await saveMetadata(state);

    console.log(`Dev server process spawned with PID ${pid} on port ${port}`);

    // Wait for server to be ready
    const isReady = await waitForServer(port);

    if (!isReady) {
      console.error("Dev server failed to start");
      await stopDevServer(projectId, branchId);
      return { port: 0, status: "error" };
    }

    console.log(`Dev server started successfully on port ${port}`);
    return { port, status: "running" };
  } catch (error) {
    console.error("Failed to start dev server", error);
    return { port: 0, status: "error" };
  }
}

/**
 * Get dev server info
 */
export function getDevServer(
  projectId: string,
  branchId: string,
): DevServerMetadata | null {
  const state = loadMetadata();
  const server = state.servers.find(
    (s) => s.projectId === projectId && s.branchId === branchId,
  );

  if (!server) {
    return null;
  }

  // Verify process is still alive
  if (!isProcessRunning(server.pid)) {
    return null;
  }

  return server;
}

/**
 * Update last accessed timestamp
 */
export async function updateLastAccessed(
  projectId: string,
  branchId: string,
): Promise<void> {
  const state = loadMetadata();
  const server = state.servers.find(
    (s) => s.projectId === projectId && s.branchId === branchId,
  );

  if (server !== undefined) {
    server.lastAccessed = Date.now();
    await saveMetadata(state);
  }
}

/**
 * Stop all dev servers (for cleanup)
 */
export async function stopAllDevServers(): Promise<void> {
  console.log("Stopping all dev servers");

  const state = loadMetadata();

  for (const server of state.servers) {
    await killProcess(server.projectId, server.branchId, server.pid);
  }

  // Clear metadata
  state.servers = [];
  await saveMetadata(state);

  console.log("All dev servers stopped");
}
