import { useCallback, useEffect, useMemo } from 'react';
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
import dagre from 'dagre';
import { LineageNode } from '@/lib/excelParser';
import { CustomNode } from './CustomNode';

interface LineageFlowGraphProps {
  data: LineageNode;
}

// Dagre layout helper
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 440;
const nodeHeight = 160;

function getLayoutedElements(nodes: Node[], edges: Edge[], direction: 'LR' | 'RL' = 'LR') {
  const isHorizontal = direction === 'LR' || direction === 'RL';
  dagreGraph.setGraph({ rankdir: direction, nodesep: 80, ranksep: 140, marginx: 50, marginy: 50 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = Position.Left;
    node.sourcePosition = Position.Right;

    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };
  });

  return { nodes, edges };
}

export const LineageFlowGraph = ({ data }: LineageFlowGraphProps) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const nodeTypes = useMemo(() => ({ custom: CustomNode }), []);

  const buildGraph = useCallback((root: LineageNode) => {
    const nodesMap = new Map<string, Node>();
    const edgesList: Edge[] = [];
    const visiting = new Set<string>();

    const ensureNode = (n: LineageNode) => {
      const id = n.lot_no;
      if (!nodesMap.has(id)) {
        nodesMap.set(id, {
          id,
          type: 'custom',
          position: { x: 0, y: 0 },
          data: {
            lot_no: n.lot_no,
            process_types: n.process_types || [],
            details: n.details || {},
            relationship: n.relationship,
            is_origin: n.is_origin,
            warning: n.warning,
            sources_count: n.sources?.length || 0,
          },
        });
      }
      return nodesMap.get(id)!;
    };

    const walk = (current: LineageNode) => {
      if (visiting.has(current.lot_no)) return; // prevent cycles
      visiting.add(current.lot_no);

      ensureNode(current);

      // Process source nodes (backwards - materials consumed)
      if (current.sources && current.sources.length > 0) {
        current.sources.forEach((src) => {
          ensureNode(src);
          // Edge from source (left) to current (right)
          const edgeId = `${src.lot_no}->${current.lot_no}`;
          if (!edgesList.find((e) => e.id === edgeId)) {
            edgesList.push({
              id: edgeId,
              source: src.lot_no,
              target: current.lot_no,
              type: 'smoothstep',
              animated: true,
              style: { stroke: 'hsl(var(--accent))', strokeWidth: 3 },
              markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--accent))', width: 20, height: 20 },
              label: src.relationship || 'source',
              labelStyle: { fill: 'hsl(var(--foreground))', fontSize: 12, fontWeight: 600 },
              labelBgStyle: { fill: 'hsl(var(--background))', fillOpacity: 0.9 },
              labelBgPadding: [8, 4],
              labelBgBorderRadius: 4,
            });
          }
          walk(src);
        });
      }

      // Process destination nodes (forwards - transferred to)
      if (current.destinations && current.destinations.length > 0) {
        current.destinations.forEach((dest) => {
          ensureNode(dest);
          // Edge from current to destination (forward flow)
          const edgeId = `${current.lot_no}->${dest.lot_no}`;
          if (!edgesList.find((e) => e.id === edgeId)) {
            edgesList.push({
              id: edgeId,
              source: current.lot_no,
              target: dest.lot_no,
              type: 'smoothstep',
              animated: true,
              style: { stroke: 'hsl(var(--secondary))', strokeWidth: 3 },
              markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--secondary))', width: 20, height: 20 },
              label: dest.relationship || 'destination',
              labelStyle: { fill: 'hsl(var(--foreground))', fontSize: 12, fontWeight: 600 },
              labelBgStyle: { fill: 'hsl(var(--background))', fillOpacity: 0.9 },
              labelBgPadding: [8, 4],
              labelBgBorderRadius: 4,
            });
          }
          walk(dest);
        });
      }

      visiting.delete(current.lot_no);
    };

    walk(root);

    const nodesArr = Array.from(nodesMap.values());
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodesArr, edgesList, 'LR');
    return { nodes: layoutedNodes, edges: layoutedEdges };
  }, []);

  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = buildGraph(data);
    setNodes(newNodes);
    setEdges(newEdges);
  }, [data, buildGraph, setNodes, setEdges]);

  return (
    <div className="w-full h-[820px] rounded-lg border border-border overflow-hidden bg-gradient-to-br from-background via-background to-accent/5">
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
        defaultEdgeOptions={{ animated: true, style: { strokeWidth: 3 } }}
      >
        <Background color="hsl(var(--muted-foreground))" gap={16} />
        <Controls className="bg-card border border-border rounded-lg" />
        <MiniMap
          className="bg-card border border-border rounded-lg"
          pannable
          zoomable
          nodeColor={(node) => {
            const processTypes = (node.data as any)?.process_types as string[];
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
