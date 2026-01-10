"use client";

import { useMutation } from "@tanstack/react-query";
import {
  type ColorMode,
  type Edge,
  Background,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import { ArrowUpDownIcon, MinusIcon, PlusIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useMemo, useState } from "react";

import type { RouterOutputs } from "@weldr/api";
import { Button } from "@weldr/ui/components/button";
import { toast } from "@weldr/ui/hooks/use-toast";

import { useTRPC } from "@/lib/trpc/react";
import type { CanvasNode } from "@/types";
import { Chat } from "../chat/chat";

import "@xyflow/react/dist/base.css";

import { DbModelNode } from "./nodes/declaration/db-model";
import { EndpointNode } from "./nodes/declaration/endpoint";
import "@weldr/ui/styles/canvas.css";

import { PageNode } from "./nodes/declaration/page";
import { Placeholder } from "./placeholder";

const nodeTypes = {
  endpoint: EndpointNode,
  "db-model": DbModelNode,
  page: PageNode,
};

export function Editor({
  initialNodes,
  initialEdges,
  project,
  branch,
  integrationTemplates,
  environmentVariables,
}: {
  initialNodes: CanvasNode[];
  initialEdges: Edge[];
  project: RouterOutputs["projects"]["byId"];
  branch: RouterOutputs["branches"]["byIdOrMain"];
  integrationTemplates: RouterOutputs["integrationTemplates"]["list"];
  environmentVariables: RouterOutputs["environmentVariables"]["list"];
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const viewPort = useViewport();
  const { resolvedTheme } = useTheme();
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(initialNodes);
  const [edges, _setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const trpc = useTRPC();

  const updateNode = useMutation(
    trpc.nodes.update.mutationOptions({
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      },
    }),
  );

  const batchUpdateNodePositions = useMutation(
    trpc.nodes.batchUpdatePositions.mutationOptions({
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      },
    }),
  );

  // Arrange nodes function
  const arrangeNodes = useCallback(async () => {
    if (nodes.length === 0) return;

    // Group nodes by type
    const pageNodes = nodes.filter((node) => node.type === "page");
    const endpointNodes = nodes.filter((node) => node.type === "endpoint");
    const dbModelNodes = nodes.filter((node) => node.type === "db-model");

    // Node dimensions and spacing configuration
    const nodeConfig = {
      page: {
        width: 400,
        height: 300,
        hSpacing: 480, // node width + padding
        vSpacing: 380, // node height + padding
      },
      endpoint: {
        width: 256,
        height: 400,
        hSpacing: 336, // node width + padding
        vSpacing: 480, // node height + padding
      },
      "db-model": {
        width: 300,
        height: 280,
        hSpacing: 380, // node width + padding
        vSpacing: 360, // node height + padding
      },
    };

    const groupGap = 200; // Gap between groups
    const startX = 100;
    const startY = 100;

    const calculateGrid = (nodeCount: number) => {
      if (nodeCount === 0) return { columns: 0, rows: 0 };
      // this logic prefers vertical layouts by having more rows than columns
      const columns = Math.floor(Math.sqrt(nodeCount));
      const rows = Math.ceil(nodeCount / columns);
      return { columns, rows };
    };

    const arrangedNodes: CanvasNode[] = [];
    let currentGroupX = startX;

    // Arrange Pages
    if (pageNodes.length > 0) {
      const grid = calculateGrid(pageNodes.length);
      for (let i = 0; i < pageNodes.length; i++) {
        const node = pageNodes[i];
        const col = Math.floor(i / grid.rows);
        const row = i % grid.rows;
        if (node) {
          arrangedNodes.push({
            ...node,
            position: {
              x: currentGroupX + col * nodeConfig.page.hSpacing,
              y: startY + row * nodeConfig.page.vSpacing,
            },
          });
        }
      }
      const groupWidth =
        grid.columns > 0
          ? (grid.columns - 1) * nodeConfig.page.hSpacing + nodeConfig.page.width
          : 0;
      currentGroupX += groupWidth + groupGap;
    }

    // Arrange Endpoints
    if (endpointNodes.length > 0) {
      const grid = calculateGrid(endpointNodes.length);
      for (let i = 0; i < endpointNodes.length; i++) {
        const node = endpointNodes[i];
        const col = Math.floor(i / grid.rows);
        const row = i % grid.rows;
        if (node) {
          arrangedNodes.push({
            ...node,
            position: {
              x: currentGroupX + col * nodeConfig.endpoint.hSpacing,
              y: startY + row * nodeConfig.endpoint.vSpacing,
            },
          });
        }
      }
      const groupWidth =
        grid.columns > 0
          ? (grid.columns - 1) * nodeConfig.endpoint.hSpacing + nodeConfig.endpoint.width
          : 0;
      currentGroupX += groupWidth + groupGap;
    }

    // Arrange DB Models
    if (dbModelNodes.length > 0) {
      const grid = calculateGrid(dbModelNodes.length);
      for (let i = 0; i < dbModelNodes.length; i++) {
        const node = dbModelNodes[i];
        const col = Math.floor(i / grid.rows);
        const row = i % grid.rows;
        if (node) {
          arrangedNodes.push({
            ...node,
            position: {
              x: currentGroupX + col * nodeConfig["db-model"].hSpacing,
              y: startY + row * nodeConfig["db-model"].vSpacing,
            },
          });
        }
      }
    }

    // Add back any other nodes not part of the main groups
    const arrangedNodeIds = new Set(arrangedNodes.map((n) => n.id));
    const otherNodes = nodes.filter((n) => !arrangedNodeIds.has(n.id));

    const animatedNodes = [...arrangedNodes, ...otherNodes].map((node) => ({
      ...node,
      style: {
        ...node.style,
        transition: "all 0.8s ease-in-out",
      },
    }));

    setNodes(animatedNodes);

    // Save all node positions to database
    const updates = [...arrangedNodes, ...otherNodes].map((node) => ({
      id: node.id,
      position: {
        x: Math.floor(node.position.x),
        y: Math.floor(node.position.y),
      },
    }));

    await batchUpdateNodePositions.mutateAsync({ updates });

    // Auto-fit view to show all arranged nodes
    setTimeout(() => {
      fitView({ maxZoom: 1, duration: 800 });
      // remove transition after animation
      setNodes([...arrangedNodes, ...otherNodes]);
    }, 800);
  }, [nodes, setNodes, fitView, batchUpdateNodePositions]);

  // Create edges with conditional opacity based on hovered node and expanded state
  const styledEdges = useMemo(() => {
    return edges.map((edge) => ({
      ...edge,
      style: {
        ...edge.style,
        opacity:
          // Hide edges if either connected node is expanded
          expandedNodes.has(edge.source) || expandedNodes.has(edge.target)
            ? 0
            : // Show edges only when hovering over connected nodes
              hoveredNode && (edge.source === hoveredNode || edge.target === hoveredNode)
              ? 1
              : 0,
        transition: "opacity 0.3s ease-in-out",
      },
    }));
  }, [edges, hoveredNode, expandedNodes]);

  const onNodeMouseEnter = useCallback((_event: React.MouseEvent, node: CanvasNode) => {
    setHoveredNode(node.id);
  }, []);

  const onNodeMouseLeave = useCallback(() => {
    setHoveredNode(null);
  }, []);

  const onNodeExpand = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => new Set(prev).add(nodeId));
  }, []);

  const onNodeCollapse = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const newSet = new Set(prev);
      newSet.delete(nodeId);
      return newSet;
    });
  }, []);

  // Add expand/collapse callbacks to node data
  const styledNodes = useMemo(() => {
    return nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onExpand: () => onNodeExpand(node.id),
        onCollapse: () => onNodeCollapse(node.id),
      },
    }));
  }, [nodes, onNodeExpand, onNodeCollapse]);

  const onNodeDragStop = useCallback(
    async (_event: React.MouseEvent, node: CanvasNode, _nodes: CanvasNode[]) => {
      const updatedData = {
        where: {
          id: node.id,
        },
        payload: {
          position: {
            x: Math.floor(node.position.x),
            y: Math.floor(node.position.y),
          },
        },
      };

      await updateNode.mutateAsync(updatedData);
    },
    [updateNode],
  );

  return (
    <ReactFlow
      nodes={styledNodes}
      onNodesChange={onNodesChange}
      edges={styledEdges}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={onNodeDragStop}
      onNodeMouseEnter={onNodeMouseEnter}
      onNodeMouseLeave={onNodeMouseLeave}
      deleteKeyCode={null}
      nodeTypes={nodeTypes}
      panOnScroll={true}
      maxZoom={2}
      minZoom={0.1}
      fitView={true}
      fitViewOptions={{
        maxZoom: 1,
      }}
      colorMode={resolvedTheme as ColorMode}
    >
      {nodes.length === 0 && <Placeholder />}
      <Background color="transparent" bgColor="var(--color-background)" />

      <Panel position="bottom-left" className="mb-4 ml-4 max-h-[calc(100vh-40px)] w-[500px]">
        <Chat
          project={project}
          branch={branch}
          integrationTemplates={integrationTemplates}
          environmentVariables={environmentVariables}
        />
      </Panel>

      <Panel position="bottom-right" className="flex items-center rounded-lg border bg-background">
        <Button
          className="size-9 rounded-r-none"
          variant="ghost"
          size="icon"
          disabled={!nodes.length}
          onClick={arrangeNodes}
          title="Arrange nodes (Pages → Endpoints → DB Models)"
        >
          <ArrowUpDownIcon className="size-3.5" />
        </Button>
        <Button
          className="size-9 rounded-none"
          variant="ghost"
          size="icon"
          disabled={!nodes.length}
          onClick={() => {
            zoomOut();
          }}
        >
          <MinusIcon className="size-3.5" />
        </Button>
        <Button
          className="h-9 rounded-none px-2 text-xs"
          variant="ghost"
          disabled={!nodes.length}
          onClick={() => {
            fitView({
              maxZoom: 1,
            });
          }}
        >
          {`${Math.floor(viewPort.zoom * 100)}%`}
        </Button>
        <Button
          className="size-9 rounded-r-lg rounded-l-none"
          variant="ghost"
          disabled={!nodes.length}
          size="icon"
          onClick={() => {
            zoomIn();
          }}
        >
          <PlusIcon className="size-3.5" />
        </Button>
      </Panel>
    </ReactFlow>
  );
}
