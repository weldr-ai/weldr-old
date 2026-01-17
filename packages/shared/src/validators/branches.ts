import { z } from "zod";

import { snapshotSchema } from "./snapshots";

/**
 * Branch schema - named reference to a snapshot
 */
export const branchSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  snapshotId: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  snapshot: snapshotSchema.nullable().optional(),
});

/**
 * Schema for creating a new branch
 */
export const createBranchSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(100),
  fromSnapshotId: z.string().optional(),
  fromBranchName: z.string().optional(),
});

/**
 * Schema for moving a branch to a different snapshot
 */
export const moveBranchSchema = z.object({
  branchId: z.string(),
  snapshotId: z.string(),
});

/**
 * Schema for advancing a branch (creating a snapshot and moving branch to it)
 */
export const advanceBranchSchema = z.object({
  branchId: z.string(),
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
 * Schema for merging branches
 */
export const mergeBranchesSchema = z.object({
  targetBranchId: z.string(),
  sourceBranchIds: z.array(z.string()),
  commitSha: z.string(),
  title: z.string(),
});
