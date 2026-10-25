'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ReactFlow,
  Background,
  Controls,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Agent {
  id: string;
  slug: string;
  realName: string;
  roleKey: string | null;
  roleTitle: string;
  department: string | null;
  hierarchyLevel: number;
  reportingManagerId: string | null;
  backupAgentId: string | null;
  instructions: string;
  description: string;
  enabled: boolean;
  ownedFlowIds: string[];
  planningTier: 'top' | 'auto' | null;
  developmentTier: 'top' | 'auto' | null;
  modelOverride: string | null;
  planningModel?: string;
  developmentModel?: string;
}

interface ModelTiers {
  planning: 'top' | 'auto';
  development: 'top' | 'auto';
  topModel: string | null;
  autoModel: string | null;
  planningModel: string;
  developmentModel: string;
}

interface CompanyResponse { agents: Agent[]; modelTiers: ModelTiers }

function tierValue(value: FormDataEntryValue | null): 'top' | 'auto' | null {
  return value === 'top' || value === 'auto' ? value : null;
}

export default function CompanyPage() {
  const params = useParams<{ id: string }>();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tiers, setTiers] = useState<ModelTiers | null>(null);
  const [topModel, setTopModel] = useState('');
  const [autoModel, setAutoModel] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [realName, setRealName] = useState('');
  const [roleTitle, setRoleTitle] = useState('Engineer');
  const [instructions, setInstructions] = useState('Describe the work this person owns.');

  const load = useCallback(async () => {
    const data = await api<CompanyResponse>(`/projects/${params.id}/company`);
    setAgents(data.agents);
    setTiers(data.modelTiers);
    setTopModel(data.modelTiers.topModel ?? '');
    setAutoModel(data.modelTiers.autoModel ?? '');
  }, [params.id]);

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Could not load the company'));
  }, [load]);

  const current = agents.find((agent) => agent.id === selected) ?? null;

  const nodes: Node[] = useMemo(() => {
    const columns = new Map<number, number>();
    return agents.map((agent) => {
      const column = columns.get(agent.hierarchyLevel) ?? 0;
      columns.set(agent.hierarchyLevel, column + 1);
      return {
        id: agent.id,
        position: { x: column * 240, y: (agent.hierarchyLevel - 1) * 140 },
        data: { label: `${agent.realName}\n${agent.roleTitle}${agent.enabled ? '' : ' · OFF'}` },
        style: {
          width: 220,
          whiteSpace: 'pre-wrap' as const,
          fontSize: 12,
          borderRadius: 8,
          padding: 8,
          opacity: agent.enabled ? 1 : 0.45,
        },
      };
    });
  }, [agents]);

  const edges: Edge[] = useMemo(() => agents.flatMap((agent) => (
    agent.reportingManagerId ? [{ id: `${agent.reportingManagerId}-${agent.id}`, source: agent.reportingManagerId, target: agent.id }] : []
  )), [agents]);

  async function saveEdits(event: React.FormEvent) {
    event.preventDefault();
    if (!current) return;
    const form = new FormData(event.currentTarget as HTMLFormElement);
    await api(`/projects/${params.id}/agents/${current.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        roleTitle: String(form.get('roleTitle') ?? ''),
        description: String(form.get('description') ?? ''),
        instructions: String(form.get('instructions') ?? ''),
        planningTier: tierValue(form.get('planningTier')),
        developmentTier: tierValue(form.get('developmentTier')),
        modelOverride: String(form.get('modelOverride') ?? '').trim() || null,
      }),
    });
    await load();
  }

  async function toggle() {
    if (!current) return;
    await api(`/projects/${params.id}/agents/${current.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: !current.enabled }),
    });
    await load();
  }

  async function remove() {
    if (!current) return;
    await api(`/projects/${params.id}/agents/${current.id}`, { method: 'DELETE' });
    setSelected(null);
    await load();
  }

  async function addAgent(event: React.FormEvent) {
    event.preventDefault();
    await api(`/projects/${params.id}/agents`, {
      method: 'POST',
      body: JSON.stringify({
        realName,
        roleTitle,
        roleKey: 'fullstack',
        instructions,
        managerId: agents.find((agent) => agent.roleKey === 'cto')?.id ?? agents[0]?.id ?? null,
      }),
    });
    setRealName('');
    await load();
  }

  async function saveTiers(event: React.FormEvent) {
    event.preventDefault();
    if (!tiers) return;
    await api(`/projects/${params.id}/model-tiers`, {
      method: 'PATCH',
      body: JSON.stringify({
        planning: tiers.planning,
        development: tiers.development,
        topModel: topModel.trim() || null,
        autoModel: autoModel.trim() || null,
      }),
    });
    await load();
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Org chart</h1>
        <Link href={`/projects/${params.id}/knowledge`} className="text-sm text-aria-400">Knowledge map</Link>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {tiers && (
        <form onSubmit={saveTiers} className="space-y-3 max-w-xl border border-border rounded-lg p-4">
          <h2 className="font-semibold">Model tiers</h2>
          <p className="text-sm text-muted-foreground">
            Planning uses {tiers.planningModel}. Development uses {tiers.developmentModel}. An empty model id keeps the provider default.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="project-planning">Planning</Label>
              <select
                id="project-planning"
                data-testid="project-planning-tier"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={tiers.planning}
                onChange={(event) => setTiers({ ...tiers, planning: event.target.value === 'auto' ? 'auto' : 'top' })}
              >
                <option value="top">Top tier</option>
                <option value="auto">Auto / standard</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-development">Development</Label>
              <select
                id="project-development"
                data-testid="project-development-tier"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={tiers.development}
                onChange={(event) => setTiers({ ...tiers, development: event.target.value === 'top' ? 'top' : 'auto' })}
              >
                <option value="auto">Auto / standard</option>
                <option value="top">Top tier</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="top-model">Top model id</Label>
              <Input id="top-model" data-testid="project-top-model" value={topModel} onChange={(event) => setTopModel(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="auto-model">Auto / standard model id</Label>
              <Input id="auto-model" data-testid="project-auto-model" value={autoModel} onChange={(event) => setAutoModel(event.target.value)} />
            </div>
          </div>
          <Button type="submit" variant="outline" data-testid="save-model-tiers">Save tiers</Button>
        </form>
      )}
      <div data-testid="org-chart" className="h-[480px] border border-border rounded-lg">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          onNodeClick={(_event, node) => setSelected(node.id)}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
      <ul className="flex flex-wrap gap-2">
        {agents.map((agent) => (
          <li key={agent.id}>
            <button
              type="button"
              data-testid={`agent-${agent.slug}`}
              className="text-left text-sm border border-border rounded-md px-2 py-1"
              onClick={() => setSelected(agent.id)}
            >
              {agent.realName} · {agent.enabled ? 'ON' : 'OFF'}
            </button>
          </li>
        ))}
      </ul>
      {current && (
        <form onSubmit={saveEdits} className="space-y-3 max-w-xl border border-border rounded-lg p-4">
          <h2 className="font-semibold">{current.realName}</h2>
          <div className="space-y-1.5">
            <Label htmlFor="roleTitle">Role</Label>
            <Input id="roleTitle" name="roleTitle" defaultValue={current.roleTitle} key={`${current.id}-role`} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Responsibilities</Label>
            <Input id="description" name="description" defaultValue={current.description} key={`${current.id}-desc`} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="instructions">Instructions</Label>
            <textarea
              id="instructions"
              name="instructions"
              data-testid="agent-instructions"
              key={`${current.id}-inst`}
              defaultValue={current.instructions}
              className="w-full min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Planning model {current.planningModel ?? 'inherits'}. Development model {current.developmentModel ?? 'inherits'}.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="agent-planning">Planning tier</Label>
              <select
                id="agent-planning"
                name="planningTier"
                data-testid="agent-planning-tier"
                key={`${current.id}-ptier`}
                defaultValue={current.planningTier ?? ''}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Inherit project</option>
                <option value="top">Top tier</option>
                <option value="auto">Auto / standard</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-development">Development tier</Label>
              <select
                id="agent-development"
                name="developmentTier"
                data-testid="agent-development-tier"
                key={`${current.id}-dtier`}
                defaultValue={current.developmentTier ?? ''}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Inherit project</option>
                <option value="top">Top tier</option>
                <option value="auto">Auto / standard</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="model-override">Model override</Label>
            <Input id="model-override" name="modelOverride" data-testid="agent-model-override" key={`${current.id}-model`} defaultValue={current.modelOverride ?? ''} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="aria" data-testid="save-agent">Save</Button>
            <Button type="button" variant="outline" data-testid="agent-toggle" onClick={toggle}>{current.enabled ? 'Turn OFF' : 'Turn ON'}</Button>
            <Button type="button" variant="ghost" data-testid="agent-delete" onClick={remove}>Delete</Button>
          </div>
        </form>
      )}
      <form onSubmit={addAgent} className="space-y-3 max-w-xl border border-border rounded-lg p-4">
        <h2 className="font-semibold">Add an agent</h2>
        <div className="space-y-1.5">
          <Label htmlFor="new-name">Name</Label>
          <Input id="new-name" data-testid="new-agent-name" value={realName} onChange={(event) => setRealName(event.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-role">Role title</Label>
          <Input id="new-role" data-testid="new-agent-role" value={roleTitle} onChange={(event) => setRoleTitle(event.target.value)} />
        </div>
        <Button type="submit" variant="outline" data-testid="add-agent">Add</Button>
      </form>
    </div>
  );
}
