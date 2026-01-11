import { get, head, list, put, remove } from "@tigrisdata/storage";

import { Logger } from "@weldr/shared/logger";

import { CloudStorageError, withRetry } from "./errors";
import type { StorageBackend } from "./types";

/**
 * Cloud storage configuration (Tigris/S3-compatible)
 */
export interface CloudStorageConfig {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
}

/**
 * Cloud storage backend using Tigris (S3-compatible)
 * Stores sandbox state (AgentFS .db files) in the cloud
 */
export class CloudStorageBackend implements StorageBackend {
  private logger = Logger.get({ service: "cloud-storage" });
  private config: { bucket: string } & CloudStorageConfig;

  constructor(bucket: string, config: CloudStorageConfig) {
    this.config = { bucket, ...config };
    this.logger = Logger.get({ service: "cloud-storage", bucket });
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
      throw new CloudStorageError(
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
          throw new CloudStorageError(
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
          throw new CloudStorageError(
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
          throw new CloudStorageError(
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
            throw new CloudStorageError(
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
