import { defineCommand } from "just-bash";

import type { AgentFSInstance } from "./agentfs";
import { type RealBinaryExecOptions, execRealBinary } from "./agentfs-exec";

interface CustomCommandOptions {
  agent: AgentFSInstance;
  branchDir: string;
}

export function createBunCommand(options: CustomCommandOptions): ReturnType<typeof defineCommand> {
  return defineCommand("bun", async (args, _ctx) => {
    const subcommand = args[0];
    const modifiesLockfile =
      subcommand === "install" || subcommand === "add" || subcommand === "remove";

    const execOptions: RealBinaryExecOptions = {
      agent: options.agent,
      branchDir: options.branchDir,
      syncBackPatterns: modifiesLockfile ? ["bun.lockb", "package.json"] : undefined,
    };

    const result = await execRealBinary("bun", args, execOptions);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  });
}

export function createGitCommand(options: CustomCommandOptions): ReturnType<typeof defineCommand> {
  return defineCommand("git", async (args, _ctx) => {
    const subcommand = args[0];
    const modifiesGitDir =
      subcommand === "init" ||
      subcommand === "add" ||
      subcommand === "commit" ||
      subcommand === "checkout" ||
      subcommand === "branch" ||
      subcommand === "merge" ||
      subcommand === "rebase" ||
      subcommand === "reset" ||
      subcommand === "stash" ||
      subcommand === "tag";

    const execOptions: RealBinaryExecOptions = {
      agent: options.agent,
      branchDir: options.branchDir,
      syncBackPatterns: modifiesGitDir ? [".git"] : undefined,
    };

    const result = await execRealBinary("git", args, execOptions);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  });
}
