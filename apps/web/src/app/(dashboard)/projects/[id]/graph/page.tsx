'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ConceptGraph, ConceptNode } from '@aria/shared';
import {
  ArrowLeft, Loader2, BrainCircuit, X,
  FileCode2, Box, Server, Globe, Database,
  Code2, LayoutTemplate, Braces,
  RefreshCw, Zap,
} from 'lucide-react';

const NODE_ICONS: Record<string, React.ElementType> = {
  file: FileCode2, module: Box, service: Server, endpoint: Globe,
  db_table: Database, function: Code2, class: LayoutTemplate, interface: Braces,
};

function buildFlow(graph: ConceptGraph): { nodes: Node[]; edges: Edge[] } {
  const cols  = Math.max(1, Math.ceil(Math.sqrt(graph.nodes.length)));
  const GAP_X = 200;
  const GAP_Y = 120;

  const nodes: Node[] = graph.nodes.map((n, i) => {
    return {
      id: n.id,
      position: { x: (i % cols) * GAP_X, y: Math.floor(i / cols) * GAP_Y },
      data: { label: n.name, raw: n },
      style: {
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
        color: 'hsl(var(--foreground))',
        borderRadius: 8,
        padding: '6px 12px',
        fontSize: 12,
        minWidth: 120,
        maxWidth: 180,
        cursor: 'pointer',
      },
    };
  });

  const edges: Edge[] = graph.edges.map(e => ({
    id:       e.id,
    source:   e.sourceNodeId,
    target:   e.targetNodeId,
    label:    e.label ?? e.edgeType,
    animated: e.edgeType === 'calls' || e.edgeType === 'triggers',
    style:    { stroke: 'hsl(var(--muted-foreground))' },
    labelStyle: { fill: 'hsl(var(--muted-foreground))', fontSize: 11 },
  }));

  return { nodes, edges };
}

function NodePanel({ node, onClose }: { node: ConceptNode; onClose: () => void }) {
  const Icon  = NODE_ICONS[node.nodeType]  ?? BrainCircuit;
  return (
    <div className="absolute right-4 top-4 z-10 w-72">
      <Card className="border bg-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">{node.name}</CardTitle>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2.5 text-xs">
          <Row label="Type"    value={node.nodeType} />
          {node.filePath && <Row label="File"    value={node.filePath} mono />}
          {node.summary  && <Row label="Summary" value={node.summary}  />}
          {node.metadata && (
            <div>
              <span className="text-muted-foreground block mb-1">Metadata</span>
              <pre className="text-xs bg-muted/40 p-2 rounded overflow-auto max-h-28 font-mono">
                {(() => { try { return JSON.stringify(JSON.parse(node.metadata!), null, 2); } catch { return node.metadata; } })()}
              </pre>
            </div>
          )}
          <Row label="Created" value={new Date(node.createdAt).toLocaleString()} />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className={mono ? 'font-mono break-all' : ''}>{value}</span>
    </div>
  );
}

export default function GraphPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();

  const [graph,    setGraph]    = useState<ConceptGraph | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [selected, setSelected] = useState<ConceptNode | null>(null);
  const [clearing, setClearing] = useState(false);
  const [activeLevel, setActiveLevel] = useState<1 | 2 | 3 | 4>(1);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const fetchGraph = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await api<ConceptGraph>(`/graph/${projectId}`);
      setGraph(data);
      const { nodes: n, edges: e } = buildFlow(data);
      setNodes(n); setEdges(e);
    } catch {
      setError('Failed to load concept graph');
    } finally {
      setLoading(false);
    }
  }, [projectId, setNodes, setEdges]);

  useEffect(() => { fetchGraph(); }, [fetchGraph]);

  const handleNodeClick: NodeMouseHandler = useCallback((_evt, node) => {
    setSelected((node.data as { raw: ConceptNode }).raw);
  }, []);

  const handleClear = async () => {
    if (!confirm('Clear the concept graph for this project? This cannot be undone.')) return;
    setClearing(true);
    try {
      await api(`/graph/${projectId}`, { method: 'DELETE' });
      setGraph(null); setNodes([]); setEdges([]); setSelected(null);
    } catch {
      setError('Failed to clear graph');
    } finally {
      setClearing(false);
    }
  };

  const isEmpty = !loading && (!graph || graph.meta.status === 'empty' || graph.nodes.length === 0);

  return (
    // h-full fills the <main> which is already min-h-screen — no manual offset needed
    // The sidebar layout has no top navbar; subtracting 64px was wrong and cut the canvas short
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/50 bg-card/30 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/projects/${projectId}`)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <BrainCircuit className="h-4 w-4 text-primary" />
          <h1 className="text-lg font-semibold">Concept graph</h1>
          {graph && (
            <span className="text-xs text-muted-foreground">
              {graph.meta.nodeCount} nodes · {graph.meta.edgeCount} edges
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div data-testid="graph-level-switcher" className="flex items-center gap-1 mr-2 text-xs">
            {([
              { lvl: 1, label: 'Symbol' },
              { lvl: 2, label: 'Module' },
              { lvl: 3, label: 'Domain' },
              { lvl: 4, label: 'Decision' },
            ] as const).map(({ lvl, label }) => (
              <button
                key={lvl}
                data-testid={`graph-level-${lvl}`}
                aria-pressed={activeLevel === lvl}
                onClick={() => setActiveLevel(lvl)}
                className={
                  'rounded-md border px-2 py-1 transition-colors ' +
                  (activeLevel === lvl
                    ? 'border-primary bg-secondary text-foreground'
                    : 'border-border/60 text-muted-foreground hover:text-foreground')
                }
              >
                L{lvl} {label}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={fetchGraph} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {graph && graph.nodes.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleClear} disabled={clearing}>
              {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Clear Graph'}
            </Button>
          )}
        </div>
      </div>

      {/* Canvas body — flex-1 min-h-0 gives React Flow a real measured height */}
      <div className="flex-1 relative min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-background/60">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {isEmpty && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center text-muted-foreground">
            <BrainCircuit className="h-12 w-12 opacity-20" />
            <div>
              <p className="font-medium text-sm">No concept graph yet</p>
              <p className="text-xs mt-1">Run analysis on a connected repo to generate the graph</p>
            </div>
            <Button variant="aria" size="sm" onClick={() => router.push(`/projects/${projectId}`)}>
              <Zap className="h-3.5 w-3.5 mr-1.5" /> Go to Project
            </Button>
          </div>
        )}

        {!isEmpty && !error && (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            className="bg-background"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} />
            <Controls className="!border-border !bg-card !text-foreground" />
            <MiniMap className="!bg-card !border-border" />
          </ReactFlow>
        )}

        {selected && <NodePanel node={selected} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}
