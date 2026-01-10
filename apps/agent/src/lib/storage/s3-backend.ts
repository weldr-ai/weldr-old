import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import type { StorageBackend } from "./types";

/**
 * S3-compatible storage backend
 * Works with MinIO (local), Tigris (cloud), AWS S3, etc.
 */
export class S3StorageBackend implements StorageBackend {
  private client: S3Client;

  constructor(
    private bucket: string,
    config: {
      accessKeyId: string;
      secretAccessKey: string;
      endpoint: string;
      region?: string;
    },
  ) {
    this.client = new S3Client({
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      endpoint: config.endpoint,
      region: config.region || "auto",
      forcePathStyle: true,
    });
  }

  async copy(source: string, dest: string): Promise<void> {
    const data = await this.read(source);
    await this.write(dest, data);
  }

  async read(p: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: p,
      }),
    );
    const bytes = await response.Body?.transformToByteArray();
    return Buffer.from(bytes || []);
  }

  async write(p: string, data: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: p,
        Body: data,
      }),
    );
  }

  async delete(p: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: p,
      }),
    );
  }

  async exists(p: string): Promise<boolean> {
    try {
      await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: p,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix: string): Promise<string[]> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
      }),
    );
    return (response.Contents || [])
      .map((obj) => obj.Key)
      .filter((key): key is string => key !== undefined);
  }
}
