/**
 * Just-Bash Integration Module
 *
 * Provides a pure SDK-based bash execution environment using:
 * - AgentFS SDK for persistent virtual filesystem, KV store, and tool tracking
 * - just-bash for bash command execution (80+ built-in commands)
 * - bash-tool for AI SDK integration
 * - Custom commands for git and bun (sync to temp dir, execute, sync back)
 */

export * from "./session";
export * from "./sync";
export * from "./commands";
