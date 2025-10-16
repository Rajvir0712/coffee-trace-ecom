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
    let maxDepth = 0;

    // First pass: calculate depths for proper positioning
    const calculateDepths = (node: LineageNode, depth: number = 0): number => {
      if (visitedNodes.has(node.lot_no)) return depth;
      visitedNodes.add(node.lot_no);
      
      if (!node.sources || node.sources.length === 0) {
        return depth;
      }
      
      let maxChildDepth = depth;
      node.sources.forEach(source => {
        const childDepth = calculateDepths(source, depth + 1);
        maxChildDepth = Math.max(maxChildDepth, childDepth);
      });
      
      return maxChildDepth;
    };

    maxDepth = calculateDepths(rootNode);
    visitedNodes.clear();

    const traverse = (node: LineageNode, depth: number, y: number, parentId: string | null) => {
      const currentId = `node-${nodeId++}`;
      
      // Avoid duplicate nodes
      if (visitedNodes.has(node.lot_no)) {
        return;
      }

      visitedNodes.add(node.lot_no);

      // Calculate X position: reverse so origins are on left, final product on right
      // maxDepth is the deepest level, depth 0 is root
      const x = (maxDepth - depth) * 650 + 100;

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

      // Create edge from sources to this node (left to right flow)
      if (parentId) {
        edges.push({
          id: `edge-${currentId}-${parentId}`,
          source: currentId,
          target: parentId,
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

      // Traverse sources (children) - they go to the left (earlier in supply chain)
      if (node.sources && node.sources.length > 0) {
        const childSpacing = 350;
        const startY = y - ((node.sources.length - 1) * childSpacing) / 2;

        node.sources.forEach((source, index) => {
          traverse(source, depth + 1, startY + index * childSpacing, currentId);
        });
      }
    };

    // Start from the root (queried lot) which will be on the right
    traverse(rootNode, 0, 400, null);

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
        fitViewOptions={{ padding: 0.12 }}
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
