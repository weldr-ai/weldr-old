import { get, head, list, put, remove } from "@tigrisdata/storage";

import { Logger } from "@weldr/shared/logger";

import { TigrisError, withRetry } from "./errors";
import type { StorageBackend } from "./types";

/**
 * Tigris storage backend configuration
 */
export interface TigrisConfig {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
}

/**
 * Tigris storage backend
 * Uses @tigrisdata/storage SDK for smaller bundle size
 */
export class TigrisStorageBackend implements StorageBackend {
  private logger = Logger.get({ service: "tigris-backend" });
  private config: { bucket: string } & TigrisConfig;

  constructor(bucket: string, config: TigrisConfig) {
    this.config = { bucket, ...config };
    this.logger = Logger.get({ service: "tigris-backend", bucket });
  }

  private getStorageConfig() {
    return {
      bucket: this.config.bucket,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      endpoint: this.config.endpoint,
    };
  }

  async copy(source: string, dest: string): Promise<void> {
    this.logger.debug("Copying object", { extra: { source, dest } });
    try {
      const data = await this.read(source);
      await this.write(dest, data);
      this.logger.debug("Object copied", { extra: { source, dest } });
    } catch (error) {
      throw new TigrisError(
        `Failed to copy ${source} to ${dest}`,
        "copy",
        this.config.bucket,
        source,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async read(p: string): Promise<Buffer> {
    this.logger.debug("Reading object", { extra: { key: p } });
    return withRetry(
      async () => {
        const result = await get(p, "string", {
          config: this.getStorageConfig(),
        });

        if (result.error) {
          throw new TigrisError(
            `Failed to read ${p}: ${result.error.message}`,
            "read",
            this.config.bucket,
            p,
            result.error,
          );
        }

        return Buffer.from(result.data ?? "");
      },
      { attempts: 3, delayMs: 500 },
    );
  }

  async write(p: string, data: Buffer): Promise<void> {
    this.logger.debug("Writing object", {
      extra: { key: p, size: data.length },
    });
    return withRetry(
      async () => {
        const result = await put(p, data, {
          config: this.getStorageConfig(),
        });

        if (result.error) {
          throw new TigrisError(
            `Failed to write ${p}: ${result.error.message}`,
            "write",
            this.config.bucket,
            p,
            result.error,
          );
        }
      },
      { attempts: 3, delayMs: 500 },
    );
  }

  async delete(p: string): Promise<void> {
    this.logger.debug("Deleting object", { extra: { key: p } });
    return withRetry(
      async () => {
        const result = await remove(p, {
          config: this.getStorageConfig(),
        });

        if (result.error) {
          throw new TigrisError(
            `Failed to delete ${p}: ${result.error.message}`,
            "delete",
            this.config.bucket,
            p,
            result.error,
          );
        }
      },
      { attempts: 3, delayMs: 500 },
    );
  }

  async exists(p: string): Promise<boolean> {
    const result = await head(p, {
      config: this.getStorageConfig(),
    });

    return !result.error;
  }

  async list(prefix: string): Promise<string[]> {
    this.logger.debug("Listing objects", { extra: { prefix } });
    return withRetry(
      async () => {
        const allItems: string[] = [];
        let paginationToken: string | undefined;

        do {
          const result = await list({
            prefix,
            paginationToken,
            config: this.getStorageConfig(),
          });

          if (result.error) {
            throw new TigrisError(
              `Failed to list ${prefix}: ${result.error.message}`,
              "list",
              this.config.bucket,
              prefix,
              result.error,
            );
          }

          if (result.data?.items) {
            for (const item of result.data.items) {
              if (item.name) {
                allItems.push(item.name);
              }
            }
          }

          paginationToken = result.data?.paginationToken;
        } while (paginationToken);

        return allItems;
      },
      { attempts: 3, delayMs: 500 },
    );
  }
}
