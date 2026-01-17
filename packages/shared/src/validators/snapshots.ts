import { z } from "zod";

/**
 * Snapshot schema - immutable point in time
 */
export const snapshotSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  commitSha: z.string().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalCost: z.number(),
  createdBy: z.string().nullable(),
  createdAt: z.date(),
});

/**
 * Schema for creating a new snapshot
 */
export const createSnapshotSchema = z.object({
  projectId: z.string(),
  parentIds: z.array(z.string()),
  commitSha: z.string(),
  title: z.string(),
  description: z.string().optional(),
  metrics: z
    .object({
      inputTokens: z.number(),
      outputTokens: z.number(),
      totalCost: z.number(),
    })
    .optional(),
});

/**
 * Schema for comparing two snapshots
 */
export const compareSnapshotsSchema = z.object({
  fromSnapshotId: z.string(),
  toSnapshotId: z.string(),
});

/**
 * Schema for getting snapshot history (ancestors)
 */
export const getSnapshotHistorySchema = z.object({
  snapshotId: z.string(),
  limit: z.number().default(50),
});
