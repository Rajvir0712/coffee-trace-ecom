import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Position,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { LineageNode } from '@/lib/excelParser';
import { CustomNode } from './CustomNode';

interface LineageFlowGraphProps {
  data: LineageNode;
}

export const LineageFlowGraph = ({ data }: LineageFlowGraphProps) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const nodeTypes = useMemo(() => ({ custom: CustomNode }), []);

  const buildNodesAndEdges = useCallback((rootNode: LineageNode) => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const visitedNodes = new Set<string>();
    let nodeId = 0;

    const traverse = (node: LineageNode, x: number, y: number, parentId: string | null) => {
      const currentId = `node-${nodeId++}`;
      
      // Avoid duplicate nodes
      if (visitedNodes.has(node.lot_no)) {
        // Still create edge if there's a parent
        if (parentId) {
          edges.push({
            id: `edge-${parentId}-${currentId}`,
            source: parentId,
            target: currentId,
            type: 'smoothstep',
            animated: true,
            style: { stroke: 'hsl(var(--accent))', strokeWidth: 3 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: 'hsl(var(--accent))',
              width: 20,
              height: 20,
            },
          });
        }
        return;
      }

      visitedNodes.add(node.lot_no);

      // Create node data
      const nodeData: any = {
        lot_no: node.lot_no,
        process_types: node.process_types || [],
        details: node.details || {},
        relationship: node.relationship,
        is_origin: node.is_origin,
        warning: node.warning,
        sources_count: node.sources?.length || 0,
      };

      nodes.push({
        id: currentId,
        type: 'custom',
        position: { x, y },
        data: nodeData,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });

      // Create edge to parent
      if (parentId) {
        edges.push({
          id: `edge-${parentId}-${currentId}`,
          source: parentId,
          target: currentId,
          type: 'smoothstep',
          animated: true,
          style: { stroke: 'hsl(var(--accent))', strokeWidth: 3 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: 'hsl(var(--accent))',
            width: 20,
            height: 20,
          },
          label: node.relationship || '',
          labelStyle: { 
            fill: 'hsl(var(--foreground))',
            fontSize: 12,
            fontWeight: 600,
          },
          labelBgStyle: {
            fill: 'hsl(var(--background))',
            fillOpacity: 0.9,
          },
          labelBgPadding: [8, 4],
          labelBgBorderRadius: 4,
        });
      }

      // Traverse sources (children) - horizontal layout
      if (node.sources && node.sources.length > 0) {
        const childSpacing = 300;
        const startY = y - ((node.sources.length - 1) * childSpacing) / 2;

        node.sources.forEach((source, index) => {
          traverse(source, x + 600, startY + index * childSpacing, currentId);
        });
      }
    };

    // Start from left side
    traverse(rootNode, 100, 400, null);

    return { nodes, edges };
  }, []);

  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = buildNodesAndEdges(data);
    setNodes(newNodes);
    setEdges(newEdges);
  }, [data, buildNodesAndEdges, setNodes, setEdges]);

  return (
    <div className="w-full h-[800px] rounded-lg border border-border overflow-hidden bg-gradient-to-br from-background via-background to-accent/5">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={1.5}
        defaultEdgeOptions={{
          animated: true,
          style: { strokeWidth: 3 },
        }}
      >
        <Background color="hsl(var(--muted-foreground))" gap={16} />
        <Controls className="bg-card border border-border rounded-lg" />
        <MiniMap
          className="bg-card border border-border rounded-lg"
          nodeColor={(node) => {
            const processTypes = node.data.process_types as string[];
            if (processTypes?.includes('Purchase')) return 'hsl(var(--accent))';
            if (processTypes?.includes('Output')) return 'hsl(var(--primary))';
            if (processTypes?.includes('Transfer')) return 'hsl(var(--secondary))';
            return 'hsl(var(--muted))';
          }}
        />
      </ReactFlow>
    </div>
  );
};
