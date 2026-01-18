import type { Edge, Node, NodeProps } from "@xyflow/react";

import type { RouterOutputs } from "@weldr/api";
import type { NodeType } from "@weldr/shared/types";

export type CanvasNodeData = RouterOutputs["declarations"]["get"];
export type CanvasNode = Node<CanvasNodeData, NodeType>;
export type CanvasEdge = Edge;
export type CanvasNodeProps = NodeProps<CanvasNode>;
