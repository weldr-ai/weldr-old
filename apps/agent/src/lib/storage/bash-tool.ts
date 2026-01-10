import { agentfs } from "agentfs-sdk/just-bash";
import {
  type BashToolkit,
  type CreateBashToolOptions,
  createBashTool,
} from "bash-tool";
import { Bash } from "just-bash";

import type { AgentFSInstance } from "./agentfs";

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
 * Options for creating a bash tool backed by AgentFS
 */
export interface AgentFSBashToolOptions {
  /**
   * The AgentFS instance to use as the filesystem backend
   */
  agent: AgentFSInstance;

  /**
   * The working directory for bash commands
   * @default "/project"
   */
  cwd?: string;

  /**
   * Callback invoked before each bash command execution
   * Can be used for logging, validation, or command modification
   */
  onBeforeBashCall?: (
    input: BeforeBashCallInput,
  ) => BeforeBashCallOutput | undefined;

  /**
   * Callback invoked after each bash command execution
   * Can be used for logging or result modification
   */
  onAfterBashCall?: (
    input: AfterBashCallInput,
  ) => AfterBashCallOutput | undefined;
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
 * The tools returned by createAgentFSBashTool
 */
export interface AgentFSBashTools {
  /**
   * The bash tool for AI SDK integration
   */
  bash: BashToolkit["tools"]["bash"];

  /**
   * The readFile tool for AI SDK integration
   */
  readFile: BashToolkit["tools"]["readFile"];

  /**
   * The writeFile tool for AI SDK integration
   */
  writeFile: BashToolkit["tools"]["writeFile"];

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
 * Create a bash tool backed by AgentFS filesystem.
 *
 * This creates a sandboxed bash environment where:
 * - All file operations are persisted to AgentFS (SQLite-backed)
 * - Commands execute in a TypeScript-based bash implementation (no real shell)
 * - The agent can use familiar bash commands (grep, cat, find, etc.)
 */
export async function createAgentFSBashTool(
  options: AgentFSBashToolOptions,
): Promise<AgentFSBashTools> {
  const {
    agent,
    cwd = "/project",
    onBeforeBashCall,
    onAfterBashCall,
  } = options;

  const fs = await agentfs(agent);

  const bashInstance = new Bash({
    fs,
    cwd,
  });

  const { tools, sandbox } = await createBashTool({
    sandbox: bashInstance,
    destination: cwd,
    onBeforeBashCall:
      onBeforeBashCall as CreateBashToolOptions["onBeforeBashCall"],
    onAfterBashCall:
      onAfterBashCall as CreateBashToolOptions["onAfterBashCall"],
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
    bash: tools.bash,
    readFile: tools.readFile,
    writeFile: tools.writeFile,
    tools,
    sandbox,
    exec,
  };
}

export type { BashToolkit, CreateBashToolOptions } from "bash-tool";
export type { Bash, BashOptions, ExecOptions } from "just-bash";
