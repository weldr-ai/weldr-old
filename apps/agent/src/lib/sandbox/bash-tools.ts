import { agentfs } from "agentfs-sdk/just-bash";
import { type BashToolkit, type CreateBashToolOptions, createBashTool } from "bash-tool";
import { type CustomCommand, Bash } from "just-bash";

import type { AgentFSInstance } from "./agentfs";
import { createBunCommand, createGitCommand } from "./custom-commands";

/**
 * Callback input for before bash execution
 */
export interface BeforeBashCallInput {
  command: string;
}

/**
 * Callback output for before bash execution
 */
export interface BeforeBashCallOutput {
  command: string;
}

/**
 * Callback input for after bash execution
 */
export interface AfterBashCallInput {
  command: string;
  result: BashResult;
}

/**
 * Callback output for after bash execution
 */
export interface AfterBashCallOutput {
  result: BashResult;
}

/**
 * Options for creating a bash tool backed by the sandbox filesystem
 */
export interface SandboxBashToolOptions {
  /**
   * The AgentFS instance to use as the filesystem backend
   */
  agent: AgentFSInstance;

  /**
   * The working directory for bash commands
   * @default "/workspace"
   */
  cwd?: string;

  /**
   * Enable full network access for the agent (curl, etc.)
   * When true, agents can make HTTP requests to any URL
   * @default true
   */
  enableNetwork?: boolean;

  /**
   * Callback invoked before each bash command execution
   * Can be used for logging, validation, or command modification
   */
  onBeforeBashCall?: (input: BeforeBashCallInput) => BeforeBashCallOutput | undefined;

  /**
   * Callback invoked after each bash command execution
   * Can be used for logging or result modification
   */
  onAfterBashCall?: (input: AfterBashCallInput) => AfterBashCallOutput | undefined;

  /**
   * The branch directory for real binary execution
   */
  branchDir?: string;
}

/**
 * Result of a bash command execution
 */
export interface BashResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * The tools returned by createSandboxBashTools
 */
export interface SandboxBashTools {
  /**
   * All tools as a record for AI SDK
   */
  tools: BashToolkit["tools"];

  /**
   * The underlying sandbox for direct access
   */
  sandbox: BashToolkit["sandbox"];

  /**
   * Execute a bash command directly (without going through the AI tool)
   */
  exec: (command: string) => Promise<BashResult>;
}

/**
 * Create bash tools backed by the sandbox virtual filesystem.
 *
 * This creates a sandboxed bash environment where:
 * - All file operations are persisted to AgentFS (SQLite-backed)
 * - Commands execute in a TypeScript-based bash implementation (no real shell)
 * - The agent can use familiar bash commands (grep, cat, find, etc.)
 * - The AgentFS root is mounted at the configured working directory
 */
export async function createSandboxBashTools(
  options: SandboxBashToolOptions,
): Promise<SandboxBashTools> {
  const {
    agent,
    cwd = "/workspace",
    enableNetwork = true,
    onBeforeBashCall,
    onAfterBashCall,
    branchDir,
  } = options;

  const fs = await agentfs(agent, cwd);

  const customCommands: CustomCommand[] = [];
  if (branchDir) {
    customCommands.push(
      createBunCommand({ agent, branchDir }),
      createGitCommand({ agent, branchDir }),
    );
  }

  const bashInstance = new Bash({
    fs,
    cwd,
    network: enableNetwork
      ? {
          dangerouslyAllowFullInternetAccess: true,
        }
      : undefined,
    customCommands: customCommands.length > 0 ? customCommands : undefined,
  });

  const { tools, sandbox } = await createBashTool({
    sandbox: bashInstance,
    destination: cwd,
    onBeforeBashCall: onBeforeBashCall as CreateBashToolOptions["onBeforeBashCall"],
    onAfterBashCall: onAfterBashCall as CreateBashToolOptions["onAfterBashCall"],
  });

  const exec = async (command: string): Promise<BashResult> => {
    const result = await bashInstance.exec(command);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  };

  return {
    tools,
    sandbox,
    exec,
  };
}

export type { BashToolkit, CreateBashToolOptions } from "bash-tool";
export type { Bash, BashOptions, ExecOptions } from "just-bash";
