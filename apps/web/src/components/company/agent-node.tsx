'use client';

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';

export type AgentNodeData = {
  slug: string;
  name: string;
  role: string;
  enabled: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggle: () => void;
};

export type AgentFlowNode = Node<AgentNodeData, 'agent'>;

export function AgentNode({ data }: NodeProps<AgentFlowNode>) {
  return (
    <div className={cn('w-52 rounded-md border bg-card p-3 shadow-sm', data.selected ? 'border-primary' : 'border-border')}>
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-border" />
      <button type="button" data-testid={`agent-${data.slug}`} className="nodrag nopan block w-full text-left" onClick={data.onOpen}>
        <span className="block text-sm font-medium text-foreground">{data.name}</span>
        <span className="block text-xs text-muted-foreground">{data.role}</span>
        <span className="mt-2 block text-xs font-medium">{data.enabled ? 'ON' : 'OFF'}</span>
      </button>
      <button
        type="button"
        className="nodrag nopan mt-2 text-xs font-medium text-primary"
        aria-pressed={data.enabled}
        aria-label={data.enabled ? 'Switch off' : 'Switch on'}
        onClick={(event) => {
          event.stopPropagation();
          data.onToggle();
        }}
      >
        {data.enabled ? 'ON' : 'OFF'}
      </button>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-border" />
    </div>
  );
}
