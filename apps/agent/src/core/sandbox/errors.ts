/**
 * Base error class for all sandbox-related errors
 */
export class SandboxError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "SandboxError";
  }
}

/**
 * Error for AgentFS-specific operations
 */
export class AgentFSError extends SandboxError {
  constructor(
    message: string,
    operation: string,
    public readonly branchDir?: string,
    cause?: Error,
  ) {
    super(message, operation, cause);
    this.name = "AgentFSError";
  }
}

/**
 * Error for cloud storage operations (Tigris/S3)
 */
export class CloudStorageError extends SandboxError {
  constructor(
    message: string,
    operation: string,
    public readonly bucket?: string,
    public readonly key?: string,
    cause?: Error,
  ) {
    super(message, operation, cause);
    this.name = "CloudStorageError";
  }
}

/**
 * Error for snapshot operations
 */
export class SnapshotError extends SandboxError {
  constructor(
    message: string,
    operation: string,
    public readonly versionId?: string,
    public readonly branchId?: string,
    cause?: Error,
  ) {
    super(message, operation, cause);
    this.name = "SnapshotError";
  }
}

/**
 * Retry options for operations
 */
export interface RetryOptions {
  attempts: number;
  delayMs: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
}

/**
 * Default retry options
 */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  attempts: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 10000,
};

/**
 * Execute an operation with retry logic and exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const { attempts, delayMs, backoffMultiplier, maxDelayMs } = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
  };

  let lastError: Error | undefined;
  let currentDelay = delayMs;

  for (let i = 0; i < attempts; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, currentDelay));
        currentDelay = Math.min(currentDelay * (backoffMultiplier ?? 2), maxDelayMs ?? 10000);
      }
    }
  }

  throw lastError;
}
