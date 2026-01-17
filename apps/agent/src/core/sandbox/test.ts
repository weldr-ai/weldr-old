/**
 * Sandbox Demo Tests
 *
 * Demonstrates how the SandboxSession works for AI coding agents.
 * All tests run on a single session, simulating a real AI agent workflow.
 *
 * Run with: bun run apps/agent/src/core/sandbox/test.ts
 *
 * How SandboxSession Works:
 * - Uses just-bash for in-memory bash execution (80+ commands)
 * - Uses AgentFS SDK for persistent virtual filesystem and KV store
 * - Custom git and bun commands sync to temp dir, execute, sync back
 * - All state stored in SQLite at ~/.weldr/db/{branchId}.db
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { nanoid } from "@weldr/shared/nanoid";

import { closeSession, createSession, type SandboxSession } from "./just-bash/session";

interface TestContext {
  session: SandboxSession;
  projectId: string;
  branchId: string;
  snapshotId: string;
}

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

function log(message: string): void {
  console.log(`  ${message}`);
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function runTest(
  name: string,
  ctx: TestContext,
  testFn: (ctx: TestContext) => void | Promise<void>,
): Promise<TestResult> {
  console.log(`\n[TEST] ${name}`);
  const start = Date.now();
  try {
    await testFn(ctx);
    console.log(`  [PASS] (${Date.now() - start}ms)`);
    return { name, passed: true, duration: Date.now() - start };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`  [FAIL] ${errorMsg}`);
    return { name, passed: false, error: errorMsg, duration: Date.now() - start };
  }
}

// =============================================================================
// TEST: Session Initialization
// =============================================================================
async function testSessionInit(ctx: TestContext): Promise<void> {
  const { session } = ctx;

  log("Running first command to verify session...");
  const result = await session.bash.exec("echo 'Session initialized'");
  assert(result.exitCode === 0, `Failed to run command: ${result.stderr}`);
  assert(result.stdout.includes("Session initialized"), "Command output mismatch");

  log("Checking working directory...");
  const pwdResult = await session.bash.exec("pwd");
  assert(pwdResult.exitCode === 0, `pwd failed: ${pwdResult.stderr}`);
  log(`Working directory: ${pwdResult.stdout.trim()}`);

  log("Session created successfully");
}

// =============================================================================
// TEST: File Operations (Write, Read via commands)
// =============================================================================
async function testFileOperations(ctx: TestContext): Promise<void> {
  const { session } = ctx;

  log("Creating package.json...");
  const packageJson = `{
  "name": "demo-project",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "build": "bun build src/index.ts --outdir dist",
    "test": "echo tests-passed",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}`;

  await session.bash.writeFile("package.json", packageJson);

  log("Creating tsconfig.json...");
  const tsconfig = `{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*"]
}`;
  await session.bash.writeFile("tsconfig.json", tsconfig);

  log("Reading file back...");
  const content = await session.bash.readFile("package.json");
  assert(content.includes("demo-project"), "Content should contain project name");

  log("Checking file exists...");
  const existsResult = await session.bash.exec("test -f package.json && echo exists");
  assert(existsResult.stdout.includes("exists"), "File should exist");

  const notExistsResult = await session.bash.exec(
    "test -f nonexistent.txt && echo exists || echo not-found",
  );
  assert(notExistsResult.stdout.includes("not-found"), "Nonexistent file check");
}

// =============================================================================
// TEST: Directory Operations
// =============================================================================
async function testDirectoryOperations(ctx: TestContext): Promise<void> {
  const { session } = ctx;

  log("Creating nested directories...");
  const mkdirResult = await session.bash.exec("mkdir -p src/components src/utils");
  assert(mkdirResult.exitCode === 0, `mkdir failed: ${mkdirResult.stderr}`);

  log("Checking directories exist...");
  const checkResult = await session.bash.exec("test -d src && test -d src/components && echo ok");
  assert(checkResult.stdout.includes("ok"), "Directories should exist");

  log("Writing source files...");
  await session.bash.writeFile(
    "src/index.ts",
    'export * from "./components";\nexport * from "./utils";',
  );

  const buttonCode = `interface ButtonProps {
  label: string;
  onClick: () => void;
}

export const Button = ({ label, onClick }: ButtonProps) => {
  return { label, onClick };
};`;
  await session.bash.writeFile("src/components/Button.tsx", buttonCode);
  await session.bash.writeFile("src/components/index.ts", 'export { Button } from "./Button";');

  log("Listing directory contents...");
  const listResult = await session.bash.exec("ls -la src/");
  assert(listResult.exitCode === 0, `ls failed: ${listResult.stderr}`);
  log(`Contents of src/:\n${listResult.stdout}`);
}

// =============================================================================
// TEST: Command Execution (Various bash commands)
// =============================================================================
async function testCommandExecution(ctx: TestContext): Promise<void> {
  const { session } = ctx;

  log("Running echo command...");
  const echoResult = await session.bash.exec('echo "Hello from just-bash sandbox"');
  assert(echoResult.exitCode === 0, `echo failed: ${echoResult.stderr}`);
  assert(echoResult.stdout.includes("Hello from just-bash"), "Output mismatch");

  log("Running ls command...");
  const lsResult = await session.bash.exec("ls -la");
  assert(lsResult.exitCode === 0, `ls failed: ${lsResult.stderr}`);

  log("Running cat command...");
  const catResult = await session.bash.exec("cat package.json");
  assert(catResult.exitCode === 0, `cat failed: ${catResult.stderr}`);
  assert(catResult.stdout.includes("demo-project"), "Should read package.json");

  log("Running grep command...");
  const grepResult = await session.bash.exec('grep -r "Button" src/');
  assert(grepResult.exitCode === 0, `grep failed: ${grepResult.stderr}`);
  assert(grepResult.stdout.includes("Button"), "Should find Button");
  log(`grep result:\n${grepResult.stdout}`);
}

// =============================================================================
// TEST: Bun Install (Custom command - syncs to real FS)
// =============================================================================
async function testBunInstall(ctx: TestContext): Promise<void> {
  const { session } = ctx;

  log("Installing dependencies with bun...");
  const installResult = await session.bash.exec("bun install");
  assert(installResult.exitCode === 0, `bun install failed: ${installResult.stderr}`);
  log(`Install output:\n${installResult.stdout}`);

  // Verify bun install succeeded by checking the output
  // Note: node_modules is intentionally NOT synced back (too large)
  // bun.lockb may or may not be created depending on cache state
  assert(
    installResult.stdout.includes("package") || installResult.stdout.includes("installed"),
    "bun install should show packages installed",
  );

  log("Running bun test script...");
  const bunResult = await session.bash.exec("bun run test");
  assert(bunResult.exitCode === 0, `bun run test failed: ${bunResult.stderr}`);
  assert(bunResult.stdout.includes("tests-passed"), "Test script should pass");
  log(`Test output:\n${bunResult.stdout}`);
}

// =============================================================================
// TEST: Git Operations (Custom command - syncs to real FS)
// =============================================================================
async function testGitOperations(ctx: TestContext): Promise<void> {
  const { session } = ctx;

  log("Initializing git repository...");
  const initResult = await session.bash.exec("git init -b main");
  assert(initResult.exitCode === 0, `git init failed: ${initResult.stderr}`);

  log("Configuring git user...");
  await session.bash.exec('git config user.email "ai@weldr.dev"');
  await session.bash.exec('git config user.name "AI Agent"');

  log("Staging all files...");
  const addResult = await session.bash.exec("git add -A");
  assert(addResult.exitCode === 0, `git add failed: ${addResult.stderr}`);

  log("Creating commit...");
  const commitResult = await session.bash.exec('git commit -m "feat: initial project setup"');
  assert(commitResult.exitCode === 0, `git commit failed: ${commitResult.stderr}`);

  log("Checking git log...");
  const logResult = await session.bash.exec("git log --oneline -n 5");
  assert(logResult.exitCode === 0, `git log failed: ${logResult.stderr}`);
  assert(logResult.stdout.includes("initial project setup"), "Commit should be in log");
  log(`Recent commits:\n${logResult.stdout}`);

  log("Checking git status...");
  const statusResult = await session.bash.exec("git status");
  assert(statusResult.exitCode === 0, `git status failed: ${statusResult.stderr}`);
  log(`Git status:\n${statusResult.stdout}`);
}

// =============================================================================
// TEST: Find Files (Recursive File Discovery)
// =============================================================================
async function testFindFiles(ctx: TestContext): Promise<void> {
  const { session } = ctx;

  log("Creating additional files...");
  await session.bash.writeFile(
    "src/utils/helpers.ts",
    "export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);",
  );
  await session.bash.writeFile("src/utils/index.ts", 'export * from "./helpers";');

  log("Finding all files...");
  const allFilesResult = await session.bash.exec("find . -type f");
  assert(allFilesResult.exitCode === 0, `find failed: ${allFilesResult.stderr}`);
  log(`Total files found: ${allFilesResult.stdout.trim().split("\n").length}`);

  log("Finding files excluding node_modules...");
  const srcFilesResult = await session.bash.exec("find . -type f -not -path './node_modules/*'");
  assert(!srcFilesResult.stdout.includes("node_modules/"), "Should exclude node_modules");
  log(`Source files: ${srcFilesResult.stdout.trim().split("\n").length}`);

  log("Finding only TypeScript files...");
  const tsFilesResult = await session.bash.exec(
    "find . -type f \\( -name '*.ts' -o -name '*.tsx' \\) -not -path './node_modules/*'",
  );
  log(`TypeScript files:\n${tsFilesResult.stdout}`);
}

// =============================================================================
// TEST: Copy and Move Operations
// =============================================================================
async function testCopyMoveOperations(ctx: TestContext): Promise<void> {
  const { session } = ctx;

  log("Creating README...");
  const readmeContent = `# Demo Project

A demo project showcasing the sandbox.

## Getting Started

\`\`\`bash
bun install
bun run dev
\`\`\``;
  await session.bash.writeFile("README.md", readmeContent);

  log("Copying README to backup...");
  const copyResult = await session.bash.exec("cp README.md README.backup.md");
  assert(copyResult.exitCode === 0, `Copy failed: ${copyResult.stderr}`);

  const backupExists = await session.bash.exec("test -f README.backup.md && echo exists");
  assert(backupExists.stdout.includes("exists"), "Backup should exist");

  log("Moving backup to docs directory...");
  await session.bash.exec("mkdir -p docs");
  const moveResult = await session.bash.exec("mv README.backup.md docs/README.md");
  assert(moveResult.exitCode === 0, `Move failed: ${moveResult.stderr}`);

  const srcGone = await session.bash.exec("test -f README.backup.md && echo exists || echo gone");
  assert(srcGone.stdout.includes("gone"), "Source should not exist after move");

  const destExists = await session.bash.exec("test -f docs/README.md && echo exists");
  assert(destExists.stdout.includes("exists"), "Destination should exist");
}

// =============================================================================
// TEST: Delete Operations
// =============================================================================
async function testDeleteOperations(ctx: TestContext): Promise<void> {
  const { session } = ctx;

  log("Creating temp files to delete...");
  await session.bash.writeFile("temp-file.txt", "temporary content");
  await session.bash.exec("mkdir -p temp-dir");
  await session.bash.writeFile("temp-dir/nested.txt", "nested content");

  log("Deleting temp file...");
  const deleteFileResult = await session.bash.exec("rm temp-file.txt");
  assert(deleteFileResult.exitCode === 0, `Delete file failed: ${deleteFileResult.stderr}`);

  const fileGone = await session.bash.exec("test -f temp-file.txt && echo exists || echo gone");
  assert(fileGone.stdout.includes("gone"), "File should be deleted");

  log("Deleting temp directory recursively...");
  const deleteDirResult = await session.bash.exec("rm -rf temp-dir");
  assert(deleteDirResult.exitCode === 0, `Delete dir failed: ${deleteDirResult.stderr}`);

  const dirGone = await session.bash.exec("test -d temp-dir && echo exists || echo gone");
  assert(dirGone.stdout.includes("gone"), "Dir should be deleted");
}

// =============================================================================
// TEST: Storage Persistence (SQLite KV)
// =============================================================================
async function testStoragePersistence(ctx: TestContext): Promise<void> {
  const { session, snapshotId } = ctx;

  log("Saving session state to SQLite...");
  await session.storage.saveSessionState({
    chatId: snapshotId,
    sessionState: "processing",
    traceId: "test-trace-123",
    iterationCount: 5,
    awaitingUserKind: null,
    currentMessageId: "msg-123",
    pendingSpawnRequests: [],
    assistantContentBuffer: "partial response...",
    pausedAt: null,
    pauseReason: null,
  });
  log("State saved successfully");

  log("Loading session state from SQLite...");
  const loadedState = await session.storage.loadSessionState(snapshotId);
  if (!loadedState) {
    throw new Error("State should be loaded");
  }
  assert(
    loadedState.state === "processing",
    `State should be 'processing', got '${loadedState.state}'`,
  );
  assert(
    loadedState.iterationCount === 5,
    `Iteration count should be 5, got ${loadedState.iterationCount}`,
  );
  assert(loadedState.traceId === "test-trace-123", "TraceId should match");
  assert(loadedState.currentMessageId === "msg-123", "MessageId should match");
  assert(loadedState.assistantContentBuffer === "partial response...", "Buffer should match");
  log(`Loaded state: ${JSON.stringify(loadedState, null, 2)}`);

  log("Updating state...");
  await session.storage.saveSessionState({
    chatId: snapshotId,
    sessionState: "completed",
    traceId: "test-trace-123",
    iterationCount: 10,
    awaitingUserKind: null,
    currentMessageId: null,
    pendingSpawnRequests: [],
    assistantContentBuffer: null,
    pausedAt: null,
    pauseReason: null,
  });

  const updatedState = await session.storage.loadSessionState(snapshotId);
  if (!updatedState) {
    throw new Error("Updated state should be loaded");
  }
  assert(updatedState.state === "completed", "State should be updated to 'completed'");
  assert(updatedState.iterationCount === 10, "Iteration count should be updated to 10");
  log("State updated successfully");
}

// =============================================================================
// TEST: Tool Tracking
// =============================================================================
async function testToolTracking(ctx: TestContext): Promise<void> {
  const { session } = ctx;

  log("Starting a tool call...");
  const callId1 = await session.toolTracker.start({
    toolName: "search_files",
    parameters: { pattern: "*.ts", directory: "src" },
  });
  log(`Started tool call with ID: ${callId1}`);

  log("Completing tool call with success...");
  await session.toolTracker.complete(callId1, {
    success: true,
    result: { files: ["src/index.ts", "src/utils/helpers.ts"], count: 2 },
  });

  log("Recording a bash tool call...");
  const callId2 = await session.toolTracker.start({
    toolName: "bash",
    parameters: { command: "ls -la" },
  });
  await session.toolTracker.complete(callId2, {
    success: true,
    result: { stdout: "file1\nfile2", exitCode: 0 },
  });

  log("Recording a failed tool call...");
  const callId3 = await session.toolTracker.start({
    toolName: "bash",
    parameters: { command: "invalid-command" },
  });
  await session.toolTracker.complete(callId3, {
    success: false,
    error: "Command not found: invalid-command",
  });

  log("Getting tool stats...");
  const stats = await session.toolTracker.getStats();
  log(`Tool stats: ${JSON.stringify(stats, null, 2)}`);

  const searchStats = stats.find((s) => s.name === "search_files");
  if (!searchStats) {
    throw new Error("Should have search_files stats");
  }
  assert(searchStats.total_calls === 1, "search_files should have 1 call");
  assert(searchStats.successful === 1, "search_files should have 1 success");

  const bashStats = stats.find((s) => s.name === "bash");
  if (!bashStats) {
    throw new Error("Should have bash stats");
  }
  assert(bashStats.total_calls === 2, `bash should have 2 calls, got ${bashStats.total_calls}`);
  assert(bashStats.successful === 1, `bash should have 1 success, got ${bashStats.successful}`);
  assert(bashStats.failed === 1, `bash should have 1 failure, got ${bashStats.failed}`);

  log("Getting recent tool calls...");
  // Note: AgentFS stores timestamps in seconds (Unix time), not milliseconds
  const sinceSeconds = Math.floor((Date.now() - 60000) / 1000);
  const recent = await session.toolTracker.getRecent(sinceSeconds, 10);
  log(
    `Recent calls (${recent.length}): ${JSON.stringify(
      recent.map((c) => c.name),
      null,
      2,
    )}`,
  );
  assert(recent.length === 3, `Should have 3 recent calls, got ${recent.length}`);
}

// =============================================================================
// TEST: Metrics Collection
// =============================================================================
async function testMetricsCollection(ctx: TestContext): Promise<void> {
  const { session } = ctx;

  log("Recording LLM requests...");
  await session.metrics.recordLlmRequest(
    { inputTokens: 1500, outputTokens: 500, totalTokens: 2000 },
    { inputCost: 0.0075, outputCost: 0.0075, totalCost: 0.015 },
    2500,
  );
  await session.metrics.recordLlmRequest(
    { inputTokens: 2000, outputTokens: 800, totalTokens: 2800 },
    { inputCost: 0.01, outputCost: 0.012, totalCost: 0.022 },
    3200,
  );

  log("Recording iterations...");
  await session.metrics.recordIteration();
  await session.metrics.recordIteration();
  await session.metrics.recordIteration();

  log("Getting metrics...");
  const metrics = await session.metrics.getMetrics();
  log(`Metrics: ${JSON.stringify(metrics, null, 2)}`);

  assert(metrics.agent.llm.requests === 2, "Should have 2 LLM requests");
  assert(metrics.agent.llm.inputTokens === 3500, "Should have 3500 input tokens");
  assert(metrics.agent.llm.outputTokens === 1300, "Should have 1300 output tokens");
  assert(metrics.agent.iterations === 3, "Should have 3 iterations");
}

// =============================================================================
// TEST: Full AI Agent Workflow
// =============================================================================
async function testAIAgentWorkflow(ctx: TestContext): Promise<void> {
  const { session } = ctx;

  log("AI Agent Task: Add formatting utilities");

  // 1. Create the utility file
  log("Step 1: Creating utility file...");
  const utilCode = `/**
 * String formatting utilities
 */

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}`;

  await session.bash.writeFile("src/utils/format.ts", utilCode);

  // 2. Update exports
  log("Step 2: Updating index exports...");
  await session.bash.writeFile(
    "src/utils/index.ts",
    'export * from "./helpers";\nexport * from "./format";',
  );

  // 3. Verify changes
  log("Step 3: Verifying changes...");
  const fileExists = await session.bash.exec("test -f src/utils/format.ts && echo exists");
  assert(fileExists.stdout.includes("exists"), "format.ts should exist");

  const formatContent = await session.bash.readFile("src/utils/format.ts");
  assert(formatContent.includes("formatDate"), "Should have formatDate");
  assert(formatContent.includes("formatCurrency"), "Should have formatCurrency");
  assert(formatContent.includes("truncate"), "Should have truncate");

  // 4. Check changed files before commit
  log("Step 4: Checking changed files...");
  const statusResult = await session.bash.exec("git status --porcelain");
  log(`Changed files:\n${statusResult.stdout}`);

  // 5. Commit the changes
  log("Step 5: Committing changes...");
  await session.bash.exec("git add -A");
  const commitResult = await session.bash.exec(
    'git commit -m "feat: add string formatting utilities"',
  );
  assert(commitResult.exitCode === 0, `Commit failed: ${commitResult.stderr}`);

  // 6. Verify commit history
  log("Step 6: Verifying commit history...");
  const logResult = await session.bash.exec("git log --oneline");
  assert(logResult.stdout.includes("formatting utilities"), "New commit should be in log");
  log(`Commit history:\n${logResult.stdout}`);

  log("AI Agent completed the task successfully!");
}

// =============================================================================
// CLEANUP
// =============================================================================
async function cleanup(branchId: string): Promise<void> {
  await closeSession(branchId);

  const dbPath = path.join(os.homedir(), ".weldr", "db", `${branchId}.db`);
  try {
    await fs.rm(dbPath, { force: true });
    await fs.rm(`${dbPath}-shm`, { force: true });
    await fs.rm(`${dbPath}-wal`, { force: true });
  } catch {
    // Ignore if doesn't exist
  }
}

// =============================================================================
// MAIN TEST RUNNER
// =============================================================================
async function runDemoTests(): Promise<void> {
  const shouldCleanup = process.argv.includes("--cleanup");

  console.log("=".repeat(60));
  console.log("SANDBOX DEMO TESTS - SandboxSession");
  console.log("=".repeat(60));
  console.log("\nDemonstrating SandboxSession for AI coding agents.\n");

  const branchId = `branch-${nanoid(8)}`;
  const projectId = `demo-${nanoid(8)}`;
  const snapshotId = `snapshot-${nanoid(8)}`;

  console.log(`Project ID: ${projectId}`);
  console.log(`Branch ID:  ${branchId}`);
  console.log(`Snapshot ID: ${snapshotId}`);
  console.log(`SQLite DB:  ~/.weldr/db/${branchId}.db`);
  if (shouldCleanup) {
    console.log(`Cleanup:    ENABLED (--cleanup)`);
  }

  // Create the session
  const session = await createSession({
    branchId,
    projectId,
    snapshotId,
    workdir: "/home/user/project",
  });

  const ctx: TestContext = {
    session,
    projectId,
    branchId,
    snapshotId,
  };

  const results: TestResult[] = [];

  try {
    // Run all tests in sequence on the same session
    results.push(await runTest("Session Initialization", ctx, testSessionInit));
    results.push(await runTest("File Operations", ctx, testFileOperations));
    results.push(await runTest("Directory Operations", ctx, testDirectoryOperations));
    results.push(await runTest("Command Execution", ctx, testCommandExecution));
    results.push(await runTest("Bun Install", ctx, testBunInstall));
    results.push(await runTest("Git Operations", ctx, testGitOperations));
    results.push(await runTest("Find Files", ctx, testFindFiles));
    results.push(await runTest("Copy/Move Operations", ctx, testCopyMoveOperations));
    results.push(await runTest("Delete Operations", ctx, testDeleteOperations));
    results.push(await runTest("Storage Persistence", ctx, testStoragePersistence));
    results.push(await runTest("Tool Tracking", ctx, testToolTracking));
    results.push(await runTest("Metrics Collection", ctx, testMetricsCollection));
    results.push(await runTest("AI Agent Workflow", ctx, testAIAgentWorkflow));
  } finally {
    // Cleanup only if --cleanup flag is passed
    if (shouldCleanup) {
      await cleanup(branchId);
    } else {
      console.log(`\nDatabase preserved at: ~/.weldr/db/${branchId}.db`);
      await closeSession(branchId);
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`Total time: ${totalTime}ms`);

  if (failed > 0) {
    console.log("\nFailed tests:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

// Run if executed directly
runDemoTests().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
