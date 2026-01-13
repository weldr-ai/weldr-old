/**
 * Sandbox Demo Tests
 *
 * Demonstrates how the agentfs sandbox works for AI coding agents.
 * All tests run on a single session, simulating a real AI agent workflow.
 *
 * Run with: bun run apps/agent/src/lib/sandbox/test.ts
 *
 * Prerequisites:
 * - agentfs CLI installed globally
 * - FUSE support enabled on the system
 *
 * How AgentFS Works:
 * - `agentfs run --session <id>` runs commands with copy-on-write isolation
 * - The current working directory is the base (read-only)
 * - Changes are stored in ~/.agentfs/run/<session>/delta.db
 * - `agentfs fs <id>` commands work on the database directly
 * - `agentfs init <id>` creates a standalone database at ~/.agentfs/<id>.db
 */

import path from "node:path";

import { nanoid } from "@weldr/shared/nanoid";

import { exec, getWorkdir } from "./exec";

interface TestContext {
  projectId: string;
  branchId: string;
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
    console.log(`  ✓ Passed (${Date.now() - start}ms)`);
    return { name, passed: true, duration: Date.now() - start };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`  ✗ Failed: ${errorMsg}`);
    return { name, passed: false, error: errorMsg, duration: Date.now() - start };
  }
}

// =============================================================================
// TEST: Session Initialization
// =============================================================================
function testSessionInit(ctx: TestContext): void {
  const { projectId, branchId } = ctx;

  log("Running first command to initialize session...");
  // The session is created on first `agentfs run` command
  const result = exec("echo 'Session initialized'", { projectId, branchId });
  assert(result.exitCode === 0, `Failed to run command: ${result.stderr}`);
  assert(result.stdout.includes("Session initialized"), "Command output mismatch");

  log("Session created successfully");
}

// =============================================================================
// TEST: File Operations (Write, Read via commands)
// =============================================================================
function testFileOperations(ctx: TestContext): void {
  const { projectId, branchId } = ctx;

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
    "typescript": "^5.0.0",
    "@types/react": "^18.0.0"
  }
}`;

  // Write file using heredoc
  const writeResult = exec(
    `cat > package.json << 'EOF'
${packageJson}
EOF`,
    { projectId, branchId },
  );
  assert(writeResult.exitCode === 0, `Write failed: ${writeResult.stderr}`);

  log("Creating tsconfig.json...");
  const tsconfig = `{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src/**/*"]
}`;
  const tsconfigResult = exec(
    `cat > tsconfig.json << 'EOF'
${tsconfig}
EOF`,
    { projectId, branchId },
  );
  assert(tsconfigResult.exitCode === 0, `tsconfig write failed: ${tsconfigResult.stderr}`);

  log("Reading file back...");
  const readResult = exec("cat package.json", { projectId, branchId });
  assert(readResult.exitCode === 0, `Read failed: ${readResult.stderr}`);
  assert(readResult.stdout.includes("demo-project"), "Content should contain project name");

  log("Checking file exists...");
  const existsResult = exec("test -f package.json && echo exists", { projectId, branchId });
  assert(existsResult.stdout.includes("exists"), "File should exist");

  const notExistsResult = exec("test -f nonexistent.txt && echo exists || echo not-found", {
    projectId,
    branchId,
  });
  assert(notExistsResult.stdout.includes("not-found"), "Nonexistent file check");
}

// =============================================================================
// TEST: Directory Operations
// =============================================================================
function testDirectoryOperations(ctx: TestContext): void {
  const { projectId, branchId } = ctx;

  log("Creating nested directories...");
  const mkdirResult = exec("mkdir -p src/components", { projectId, branchId });
  assert(mkdirResult.exitCode === 0, `mkdir failed: ${mkdirResult.stderr}`);

  log("Checking directories exist...");
  const checkResult = exec("test -d src && test -d src/components && echo ok", {
    projectId,
    branchId,
  });
  assert(checkResult.stdout.includes("ok"), "Directories should exist");

  log("Writing source files...");
  exec(`echo 'export * from "./components";' > src/index.ts`, { projectId, branchId });

  const buttonCode = `interface ButtonProps {
  label: string;
  onClick: () => void;
}

export const Button = ({ label, onClick }: ButtonProps) => (
  <button onClick={onClick}>{label}</button>
);`;
  exec(
    `cat > src/components/Button.tsx << 'EOF'
${buttonCode}
EOF`,
    { projectId, branchId },
  );

  exec(`echo 'export { Button } from "./Button";' > src/components/index.ts`, {
    projectId,
    branchId,
  });

  log("Listing directory contents...");
  const listResult = exec("ls -la src/", { projectId, branchId });
  assert(listResult.exitCode === 0, `ls failed: ${listResult.stderr}`);
  log(`Contents of src/:\n${listResult.stdout}`);
}

// =============================================================================
// TEST: Command Execution
// =============================================================================
function testCommandExecution(ctx: TestContext): void {
  const { projectId, branchId } = ctx;

  log("Running echo command...");
  const echoResult = exec('echo "Hello from agentfs sandbox"', { projectId, branchId });
  assert(echoResult.exitCode === 0, `echo failed: ${echoResult.stderr}`);
  assert(echoResult.stdout.includes("Hello from agentfs"), "Output mismatch");

  log("Running ls command...");
  const lsResult = exec("ls -la", { projectId, branchId });
  assert(lsResult.exitCode === 0, `ls failed: ${lsResult.stderr}`);

  log("Running cat command...");
  const catResult = exec("cat package.json", { projectId, branchId });
  assert(catResult.exitCode === 0, `cat failed: ${catResult.stderr}`);
  assert(catResult.stdout.includes("demo-project"), "Should read package.json");
}

// =============================================================================
// TEST: Bun Install
// =============================================================================
function testBunInstall(ctx: TestContext): void {
  const { projectId, branchId } = ctx;

  log("Installing dependencies with bun...");
  const installResult = exec("bun install", { projectId, branchId });
  assert(installResult.exitCode === 0, `bun install failed: ${installResult.stderr}`);
  log(`Install output:\n${installResult.stdout}`);

  log("Checking node_modules exists...");
  const nodeModulesResult = exec("test -d node_modules && echo exists", { projectId, branchId });
  assert(nodeModulesResult.stdout.includes("exists"), "node_modules should exist");

  log("Checking typescript is installed...");
  const tscResult = exec("test -f node_modules/.bin/tsc && echo exists", { projectId, branchId });
  assert(tscResult.stdout.includes("exists"), "tsc binary should exist");

  log("Running bun test script...");
  const bunResult = exec("bun run test", { projectId, branchId });
  assert(bunResult.exitCode === 0, `bun run test failed: ${bunResult.stderr}`);
  assert(bunResult.stdout.includes("tests-passed"), "Test script should pass");
  log(`Test output:\n${bunResult.stdout}`);
}

// =============================================================================
// TEST: TypeScript Typecheck
// =============================================================================
function testTypecheck(ctx: TestContext): void {
  const { projectId, branchId } = ctx;

  log("Running TypeScript typecheck...");
  const typecheckResult = exec("bun run typecheck", { projectId, branchId });
  assert(
    typecheckResult.exitCode === 0,
    `typecheck failed: ${typecheckResult.stdout || typecheckResult.stderr}`,
  );

  log("Verifying tsconfig.json exists...");
  const tsconfigResult = exec("test -f tsconfig.json && echo exists", { projectId, branchId });
  assert(tsconfigResult.stdout.includes("exists"), "tsconfig.json should exist");

  log("Typecheck passed successfully");
}

// =============================================================================
// TEST: Find Files (Recursive File Discovery)
// =============================================================================
function testFindFiles(ctx: TestContext): void {
  const { projectId, branchId } = ctx;

  log("Creating additional files...");
  exec("mkdir -p src/utils", { projectId, branchId });
  exec(
    `echo 'export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);' > src/utils/helpers.ts`,
    { projectId, branchId },
  );
  exec("mkdir -p node_modules/some-pkg", { projectId, branchId });
  exec(`echo 'module.exports = {};' > node_modules/some-pkg/index.js`, {
    projectId,
    branchId,
  });

  log("Finding all files...");
  const allFilesResult = exec("find . -type f", { projectId, branchId });
  assert(allFilesResult.exitCode === 0, `find failed: ${allFilesResult.stderr}`);
  log(`Total files found: ${allFilesResult.stdout.trim().split("\n").length}`);

  log("Finding files excluding node_modules...");
  const srcFilesResult = exec("find . -type f -not -path './node_modules/*'", {
    projectId,
    branchId,
  });
  assert(!srcFilesResult.stdout.includes("node_modules"), "Should exclude node_modules");
  log(`Source files: ${srcFilesResult.stdout.trim().split("\n").length}`);

  log("Finding only TypeScript files...");
  const tsFilesResult = exec(
    "find . -type f \\( -name '*.ts' -o -name '*.tsx' \\) -not -path './node_modules/*'",
    { projectId, branchId },
  );
  log(`TypeScript files:\n${tsFilesResult.stdout}`);
}

// =============================================================================
// TEST: Copy and Move Operations
// =============================================================================
function testCopyMoveOperations(ctx: TestContext): void {
  const { projectId, branchId } = ctx;

  log("Creating README...");
  const readmeContent = `# Demo Project

A demo project showcasing the agentfs sandbox.

## Getting Started

\\\`\\\`\\\`bash
bun install
bun run dev
\\\`\\\`\\\``;
  exec(
    `cat > README.md << 'EOF'
${readmeContent}
EOF`,
    { projectId, branchId },
  );

  log("Copying README to backup...");
  const copyResult = exec("cp README.md README.backup.md", { projectId, branchId });
  assert(copyResult.exitCode === 0, `Copy failed: ${copyResult.stderr}`);

  const backupExists = exec("test -f README.backup.md && echo exists", { projectId, branchId });
  assert(backupExists.stdout.includes("exists"), "Backup should exist");

  log("Moving backup to docs directory...");
  exec("mkdir -p docs", { projectId, branchId });
  const moveResult = exec("mv README.backup.md docs/README.md", { projectId, branchId });
  assert(moveResult.exitCode === 0, `Move failed: ${moveResult.stderr}`);

  const srcGone = exec("test -f README.backup.md && echo exists || echo gone", {
    projectId,
    branchId,
  });
  assert(srcGone.stdout.includes("gone"), "Source should not exist after move");

  const destExists = exec("test -f docs/README.md && echo exists", { projectId, branchId });
  assert(destExists.stdout.includes("exists"), "Destination should exist");
}

// =============================================================================
// TEST: Delete Operations
// =============================================================================
function testDeleteOperations(ctx: TestContext): void {
  const { projectId, branchId } = ctx;

  // Use ~/.weldr/{branchId} for delete operations since it's writable
  const workdir = getWorkdir(branchId);
  const tempFile = path.join(workdir, `sandbox-test-${branchId}-temp.txt`);
  const tempDir = path.join(workdir, `sandbox-test-${branchId}-temp-dir`);

  log("Creating temp files to delete...");
  exec(`echo 'temporary file' > ${tempFile}`, { projectId, branchId });
  exec(`mkdir -p ${tempDir} && echo 'nested content' > ${tempDir}/nested.txt`, {
    projectId,
    branchId,
  });

  log("Deleting temp file...");
  const deleteFileResult = exec(`rm ${tempFile}`, { projectId, branchId });
  assert(deleteFileResult.exitCode === 0, `Delete file failed: ${deleteFileResult.stderr}`);

  const fileGone = exec(`test -f ${tempFile} && echo exists || echo gone`, { projectId, branchId });
  assert(fileGone.stdout.includes("gone"), "File should be deleted");

  log("Deleting temp directory recursively...");
  const deleteDirResult = exec(`rm -rf ${tempDir}`, { projectId, branchId });
  assert(deleteDirResult.exitCode === 0, `Delete dir failed: ${deleteDirResult.stderr}`);

  const dirGone = exec(`test -d ${tempDir} && echo exists || echo gone`, { projectId, branchId });
  assert(dirGone.stdout.includes("gone"), "Dir should be deleted");
}

// =============================================================================
// TEST: Git Operations
// =============================================================================
function testGitOperations(ctx: TestContext): void {
  const { projectId, branchId } = ctx;

  log("Initializing git repository...");
  const initResult = exec("git init -b main", { projectId, branchId });
  assert(initResult.exitCode === 0, `git init failed: ${initResult.stderr}`);

  log("Configuring git user...");
  exec('git config user.email "ai@weldr.dev"', { projectId, branchId });
  exec('git config user.name "AI Agent"', { projectId, branchId });

  log("Staging all files...");
  const addResult = exec("git add -A", { projectId, branchId });
  assert(addResult.exitCode === 0, `git add failed: ${addResult.stderr}`);

  log("Creating commit...");
  const commitResult = exec('git commit -m "feat: initial project setup"', { projectId, branchId });
  assert(commitResult.exitCode === 0, `git commit failed: ${commitResult.stderr}`);

  log("Checking git log...");
  const logResult = exec("git log --oneline -n 5", { projectId, branchId });
  assert(logResult.exitCode === 0, `git log failed: ${logResult.stderr}`);
  assert(logResult.stdout.includes("initial project setup"), "Commit should be in log");
  log(`Recent commits:\n${logResult.stdout}`);
}

// =============================================================================
// TEST: Full AI Agent Workflow
// =============================================================================
function testAIAgentWorkflow(ctx: TestContext): void {
  const { projectId, branchId } = ctx;

  log("AI Agent Task: Add formatting utilities");

  // 1. Create the utility file
  log("Step 1: Creating utility file...");
  const utilCode = `/**
 * String formatting utilities
 */

/**
 * Format a date to a human-readable string
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Format a number as currency
 */
export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

/**
 * Truncate a string to a maximum length
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}`;

  exec(
    `cat > src/utils/format.ts << 'EOF'
${utilCode}
EOF`,
    { projectId, branchId },
  );

  // 2. Update exports
  log("Step 2: Updating index exports...");
  exec(`echo 'export * from "./helpers";' > src/utils/index.ts`, { projectId, branchId });
  exec(`echo 'export * from "./format";' >> src/utils/index.ts`, { projectId, branchId });
  exec(`echo 'export * from "./utils";' >> src/index.ts`, { projectId, branchId });

  // 3. Verify changes
  log("Step 3: Verifying changes...");
  const fileExists = exec("test -f src/utils/format.ts && echo exists", { projectId, branchId });
  assert(fileExists.stdout.includes("exists"), "format.ts should exist");

  const formatContent = exec("cat src/utils/format.ts", { projectId, branchId });
  assert(formatContent.stdout.includes("formatDate"), "Should have formatDate");
  assert(formatContent.stdout.includes("formatCurrency"), "Should have formatCurrency");
  assert(formatContent.stdout.includes("truncate"), "Should have truncate");

  // 4. Check changed files before commit
  log("Step 4: Checking changed files...");
  const statusResult = exec("git status --porcelain", { projectId, branchId });
  log(`Changed files:\n${statusResult.stdout}`);

  // 5. Commit the changes
  log("Step 5: Committing changes...");
  exec("git add -A", { projectId, branchId });
  const commitResult = exec('git commit -m "feat: add string formatting utilities"', {
    projectId,
    branchId,
  });
  assert(commitResult.exitCode === 0, `Commit failed: ${commitResult.stderr}`);

  // 6. Verify commit history
  log("Step 6: Verifying commit history...");
  const logResult = exec("git log --oneline", { projectId, branchId });
  assert(logResult.stdout.includes("formatting utilities"), "New commit should be in log");
  log(`Commit history:\n${logResult.stdout}`);

  log("AI Agent completed the task successfully!");
}

// =============================================================================
// MAIN TEST RUNNER
// =============================================================================
async function runDemoTests(): Promise<void> {
  console.log("=".repeat(60));
  console.log("SANDBOX DEMO TESTS - Single Session");
  console.log("=".repeat(60));
  console.log("\nDemonstrating agentfs sandbox for AI coding agents.\n");

  // Create a single session for all tests
  // Working directory defaults to /workspace in exec()
  const branchId = `branch-${nanoid(8)}`;
  const ctx: TestContext = {
    projectId: `demo-${nanoid(8)}`,
    branchId,
  };

  console.log(`Project ID: ${ctx.projectId}`);
  console.log(`Branch ID:  ${ctx.branchId}`);
  console.log(`Delta DB:   ~/.agentfs/run/${ctx.branchId}/delta.db`);

  const results: TestResult[] = [];

  // Run all tests in sequence on the same session
  results.push(await runTest("Session Initialization", ctx, testSessionInit));
  results.push(await runTest("File Operations", ctx, testFileOperations));
  results.push(await runTest("Directory Operations", ctx, testDirectoryOperations));
  results.push(await runTest("Command Execution", ctx, testCommandExecution));
  results.push(await runTest("Bun Install", ctx, testBunInstall));
  results.push(await runTest("TypeScript Typecheck", ctx, testTypecheck));
  results.push(await runTest("Find Files", ctx, testFindFiles));
  results.push(await runTest("Copy/Move Operations", ctx, testCopyMoveOperations));
  results.push(await runTest("Delete Operations", ctx, testDeleteOperations));
  results.push(await runTest("Git Operations", ctx, testGitOperations));
  results.push(await runTest("AI Agent Workflow", ctx, testAIAgentWorkflow));

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

  // Cleanup
  console.log("\n" + "=".repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

// Run if executed directly
runDemoTests().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
