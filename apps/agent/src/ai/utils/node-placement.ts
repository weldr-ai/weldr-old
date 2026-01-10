import { eq } from "drizzle-orm";

import { nodes } from "@weldr/db/schema";
import type { Tx } from "@weldr/db/types";

export const NODE_DIMENSIONS = {
  page: { width: 400, height: 300 },
  endpoint: { width: 256, height: 128 },
  "db-model": { width: 300, height: 250 },
  default: { width: 300, height: 200 },
};

export const PLACEMENT_CONFIG = {
  gap: 50,
  maxCanvasWidth: 2000,
  xStep: 150,
  yStep: 150,
};

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Checks if two rectangles intersect, accounting for a gap buffer around each rectangle.
 *
 * @param a - First rectangle with position (x, y) and dimensions (width, height)
 * @param b - Second rectangle with position (x, y) and dimensions (width, height)
 * @returns True if the rectangles overlap (including gap buffer), false otherwise
 */
export const intersects = (a: Rect, b: Rect): boolean => {
  return (
    a.x < b.x + b.width + PLACEMENT_CONFIG.gap &&
    a.x + a.width + PLACEMENT_CONFIG.gap > b.x &&
    a.y < b.y + b.height + PLACEMENT_CONFIG.gap &&
    a.y + a.height + PLACEMENT_CONFIG.gap > b.y
  );
};

/**
 * Finds a non-overlapping position for a new canvas node.
 *
 * @param existingNodes - Array of existing nodes with their positions
 * @param specType - Type of spec to determine node dimensions
 * @returns Position {x, y} for the new node
 */
export async function findNodePosition(
  tx: Tx,
  projectId: string,
  specType: keyof typeof NODE_DIMENSIONS,
): Promise<{ x: number; y: number }> {
  const existingNodes = await tx.query.nodes.findMany({
    where: eq(nodes.projectId, projectId),
    with: {
      declaration: {
        columns: {
          metadata: true,
        },
      },
    },
  });

  const allRects: Rect[] = existingNodes.map((node) => {
    const type =
      (node.declaration?.metadata?.codeMetadata?.type as keyof typeof NODE_DIMENSIONS) ?? "default";
    const dimensions = NODE_DIMENSIONS[type] || NODE_DIMENSIONS.default;
    return {
      x: node.position.x,
      y: node.position.y,
      ...dimensions,
    };
  });

  const dimensions = NODE_DIMENSIONS[specType] || NODE_DIMENSIONS.default;
  const nextPos = { x: 0, y: 0 };
  let hasCollision = true;

  while (hasCollision) {
    const candidateRect: Rect = { ...nextPos, ...dimensions };
    hasCollision = allRects.some((rect) => intersects(candidateRect, rect));

    if (hasCollision) {
      nextPos.x += PLACEMENT_CONFIG.xStep;
      if (nextPos.x > PLACEMENT_CONFIG.maxCanvasWidth) {
        nextPos.x = 0;
        nextPos.y += PLACEMENT_CONFIG.yStep;
      }
    }
  }

  return nextPos;
}
