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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorNote, LoadingState } from '@/components/ui/empty-state';
import { AgentNode, type AgentNodeData } from '@/components/company/agent-node';
import { rememberProject } from '@/lib/project-selection';
import { useAriaSocket } from '@/hooks/useAriaSocket';

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
  catalog?: string[];
}

interface FlowOwner { agentId: string; layer: 'frontend' | 'backend' | 'fullstack'; role: 'owner' | 'backup' }

interface FlowRow {
  id: string;
  flowKey: string;
  name: string;
  layer?: string;
  ownerAgentId: string | null;
  backupAgentId: string | null;
  owners?: FlowOwner[];
}

interface CompanyResponse { agents: Agent[]; modelTiers: ModelTiers; flows: FlowRow[]; companySource?: string }

const LAYERS = ['fullstack', 'frontend', 'backend'] as const;

const ROLE_KEYS = [
  'ceo', 'cfo', 'cto', 'business', 'product_owner', 'scrum_master',
  'frontend', 'backend', 'fullstack', 'junior', 'aiml', 'qa', 'devops',
  'cybersecurity', 'red_team', 'blue_team', 'research', 'coach',
  'documentation', 'pr_coordinator',
] as const;

const nodeTypes = { agent: AgentNode };

function tierValue(value: FormDataEntryValue | null): 'top' | 'auto' | null {
  return value === 'top' || value === 'auto' ? value : null;
}

export default function CompanyPage() {
  const params = useParams<{ id: string }>();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [tiers, setTiers] = useState<ModelTiers | null>(null);
  const [topModel, setTopModel] = useState('');
  const [autoModel, setAutoModel] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [realName, setRealName] = useState('');
  const [roleTitle, setRoleTitle] = useState('Engineer');
  const [roleKey, setRoleKey] = useState<(typeof ROLE_KEYS)[number]>('fullstack');
  const [managerId, setManagerId] = useState('');
  const [instructions, setInstructions] = useState('Describe the work this person owns.');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [companySource, setCompanySource] = useState('template');
  const { connected, subscribe, unsubscribe, onEvent } = useAriaSocket();
  const [recentRuns, setRecentRuns] = useState<Array<{ id: string; activity: string; status: string }>>([]);

  const load = useCallback(async () => {
    const data = await api<CompanyResponse>(`/projects/${params.id}/company`);
    setAgents(data.agents);
    setFlows(data.flows);
    setCompanySource(data.companySource ?? 'template');
    setTiers(data.modelTiers);
    setTopModel(data.modelTiers.topModel ?? '');
    setAutoModel(data.modelTiers.autoModel ?? '');
    rememberProject(params.id);
  }, [params.id]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Could not load the company'))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!connected || !params.id) return;
    subscribe(`project:${params.id}`);
    void load().catch(() => undefined);
    return () => unsubscribe(`project:${params.id}`);
  }, [connected, load, params.id, subscribe, unsubscribe]);

  useEffect(() => onEvent((event) => {
    if (event.type !== 'company:updated' && event.type !== 'knowledge:updated') return;
    if (event.projectId !== params.id) return;
    if (event.type === 'company:updated' && event.source) setCompanySource(event.source);
    void load().catch(() => undefined);
  }), [load, onEvent, params.id]);

  const current = agents.find((agent) => agent.id === selected) ?? null;

  async function run(action: () => Promise<void>) {
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The company could not be updated');
    }
  }

  const toggleById = useCallback(async (agent: Agent) => {
    setError('');
    try {
      await api(`/projects/${params.id}/agents/${agent.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !agent.enabled }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The company could not be updated');
    }
  }, [load, params.id]);

  const nodes: Node[] = useMemo(() => {
    const columns = new Map<number, number>();
    return agents.map((agent) => {
      const column = columns.get(agent.hierarchyLevel) ?? 0;
      columns.set(agent.hierarchyLevel, column + 1);
      return {
        id: agent.id,
        type: 'agent',
        position: { x: column * 260, y: (agent.hierarchyLevel - 1) * 160 },
        data: {
          slug: agent.slug,
          name: agent.realName,
          role: agent.roleTitle,
          enabled: agent.enabled,
          selected: agent.id === selected,
          onOpen: () => { setSelected(agent.id); setConfirmDelete(false); },
          onToggle: () => { void toggleById(agent); },
        } satisfies AgentNodeData,
        draggable: false,
      };
    });
  }, [agents, selected, toggleById]);

  const edges: Edge[] = useMemo(() => agents.flatMap((agent) => (
    agent.reportingManagerId ? [{ id: `${agent.reportingManagerId}-${agent.id}`, source: agent.reportingManagerId, target: agent.id }] : []
  )), [agents]);

  async function saveEdits(event: React.FormEvent) {
    event.preventDefault();
    if (!current) return;
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const manager = String(form.get('reportingManagerId') ?? '');
    const backup = String(form.get('backupAgentId') ?? '');
    await run(async () => {
      await api(`/projects/${params.id}/agents/${current.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          roleTitle: String(form.get('roleTitle') ?? ''),
          description: String(form.get('description') ?? ''),
          instructions: String(form.get('instructions') ?? ''),
          planningTier: tierValue(form.get('planningTier')),
          developmentTier: tierValue(form.get('developmentTier')),
          modelOverride: String(form.get('modelOverride') ?? '').trim() || null,
          reportingManagerId: manager || null,
          backupAgentId: backup || null,
        }),
      });
      await load();
    });
  }

  async function toggle() {
    if (!current) return;
    await toggleById(current);
  }

  async function remove() {
    if (!current) return;
    await run(async () => {
      await api(`/projects/${params.id}/agents/${current.id}`, { method: 'DELETE' });
      setSelected(null);
      setConfirmDelete(false);
      await load();
    });
  }

  async function addAgent(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      await api(`/projects/${params.id}/agents`, {
        method: 'POST',
        body: JSON.stringify({
          realName,
          roleTitle,
          roleKey,
          instructions,
          managerId: managerId || null,
        }),
      });
      setRealName('');
      await load();
    });
  }

  async function saveTiers(event: React.FormEvent) {
    event.preventDefault();
    if (!tiers) return;
    await run(async () => {
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
    });
  }

  useEffect(() => {
    if (!current) { setRecentRuns([]); return; }
    api<{ runs: Array<{ id: string; activity: string; status: string }> }>(`/projects/${params.id}/runs?agentId=${current.id}&limit=5`)
      .then((data) => setRecentRuns(data.runs))
      .catch(() => setRecentRuns([]));
  }, [current, params.id]);

  async function setFlowOwner(flow: FlowRow, layer: FlowOwner['layer'], role: FlowOwner['role'], agentId: string) {
    const currentOwners = flow.owners ?? [];
    const next = currentOwners.filter((owner) => !(owner.layer === layer && owner.role === role));
    if (agentId) next.push({ agentId, layer, role });
    if (!next.some((owner) => owner.role === 'owner')) {
      setError('A flow needs at least one owner.');
      return;
    }
    await run(async () => {
      await api(`/projects/${params.id}/flows/${flow.id}/owners`, {
        method: 'PUT',
        body: JSON.stringify({ owners: next }),
      });
      await load();
    });
  }

  return (
    <div className="space-y-6 p-4 md:p-8">
      <PageHeader
        title="Company"
        description="People, who they report to, and whether they are allowed to work."
        action={(
          <span className="flex items-center gap-3">
            <Badge data-testid="company-source">{companySource === 'ai' ? 'source: AI' : 'source: template'}</Badge>
            <Link href={`/projects/${params.id}/knowledge`} className="text-sm text-primary">
              Knowledge map
            </Link>
          </span>
        )}
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      {loading && <LoadingState label="Loading the company…" />}

      {tiers && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Model tiers</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveTiers} className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Planning uses {tiers.planningModel}. Development uses {tiers.developmentModel}. Leave a model id empty to keep the provider default.
              </p>
              <p className="text-sm" data-testid="model-catalog">
                Catalog: {tiers.catalog && tiers.catalog.length > 0 ? tiers.catalog.join(', ') : 'Test Connection has not stored a catalog yet.'}
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="project-planning">Planning</Label>
                  <select id="project-planning" data-testid="project-planning-tier" className="field" value={tiers.planning} onChange={(event) => setTiers({ ...tiers, planning: event.target.value === 'auto' ? 'auto' : 'top' })}>
                    <option value="top">Top tier</option>
                    <option value="auto">Auto / standard</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="project-development">Development</Label>
                  <select id="project-development" data-testid="project-development-tier" className="field" value={tiers.development} onChange={(event) => setTiers({ ...tiers, development: event.target.value === 'top' ? 'top' : 'auto' })}>
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
          </CardContent>
        </Card>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div data-testid="org-chart" className="h-[32rem] rounded-lg border bg-card">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            nodesDraggable={false}
            onNodeClick={(_event, node) => { setSelected(node.id); setConfirmDelete(false); }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        <aside className="space-y-4 rounded-lg border bg-card p-4" aria-label="Person details">
          {current ? (
            <form onSubmit={saveEdits} className="space-y-3">
              <h2 className="font-semibold">{current.realName}</h2>
              <p className="text-sm text-muted-foreground">
                {current.enabled ? 'This person is ON and can take work.' : 'This person is OFF and uses no tokens.'}
              </p>
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
                <textarea id="instructions" name="instructions" data-testid="agent-instructions" key={`${current.id}-inst`} defaultValue={current.instructions} className="field min-h-28" />
              </div>
              <p className="text-sm text-muted-foreground">
                Planning model {current.planningModel ?? 'inherits'}. Development model {current.developmentModel ?? 'inherits'}.
              </p>
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="agent-planning">Planning tier</Label>
                  <select id="agent-planning" name="planningTier" data-testid="agent-planning-tier" key={`${current.id}-ptier`} defaultValue={current.planningTier ?? ''} className="field">
                    <option value="">Inherit project</option>
                    <option value="top">Top tier</option>
                    <option value="auto">Auto / standard</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="agent-development">Development tier</Label>
                  <select id="agent-development" name="developmentTier" data-testid="agent-development-tier" key={`${current.id}-dtier`} defaultValue={current.developmentTier ?? ''} className="field">
                    <option value="">Inherit project</option>
                    <option value="top">Top tier</option>
                    <option value="auto">Auto / standard</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="agent-manager">Manager</Label>
                  <select id="agent-manager" name="reportingManagerId" data-testid="agent-manager" key={`${current.id}-manager`} defaultValue={current.reportingManagerId ?? ''} className="field">
                    <option value="">No manager</option>
                    {agents.filter((agent) => agent.id !== current.id).map((agent) => (
                      <option key={agent.id} value={agent.id}>{agent.realName}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="agent-backup">Backup</Label>
                  <select id="agent-backup" name="backupAgentId" data-testid="agent-backup" key={`${current.id}-backup`} defaultValue={current.backupAgentId ?? ''} className="field">
                    <option value="">No backup</option>
                    {agents.filter((agent) => agent.id !== current.id).map((agent) => (
                      <option key={agent.id} value={agent.id}>{agent.realName}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="model-override">Model override</Label>
                <Input id="model-override" name="modelOverride" data-testid="agent-model-override" key={`${current.id}-model`} defaultValue={current.modelOverride ?? ''} />
              </div>
              {recentRuns.length > 0 && (
                <div className="space-y-1 text-sm">
                  <p className="font-medium">Recent runs</p>
                  <ul>
                    {recentRuns.map((run) => (
                      <li key={run.id}>
                        <Link className="text-primary" href={`/runs?project=${params.id}&agent=${current.id}`}>{run.activity} · {run.status}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" data-testid="save-agent">Save</Button>
                <Button type="button" variant="outline" data-testid="agent-toggle" onClick={toggle}>{current.enabled ? 'Turn OFF' : 'Turn ON'}</Button>
                {confirmDelete ? (
                  <Button type="button" variant="destructive" data-testid="agent-delete-confirm" onClick={remove}>Confirm delete</Button>
                ) : (
                  <Button type="button" variant="ghost" data-testid="agent-delete" onClick={() => setConfirmDelete(true)}>Delete</Button>
                )}
              </div>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">Select a person to edit their role, instructions, manager, or backup.</p>
          )}

          <form onSubmit={addAgent} className="space-y-3 border-t pt-4">
            <h2 className="font-semibold">Add a person</h2>
            <div className="space-y-1.5">
              <Label htmlFor="new-name">Name</Label>
              <Input id="new-name" data-testid="new-agent-name" value={realName} onChange={(event) => setRealName(event.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-role">Role title</Label>
              <Input id="new-role" data-testid="new-agent-title" value={roleTitle} onChange={(event) => setRoleTitle(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-role-key">Role</Label>
              <select
                id="new-role-key"
                data-testid="new-agent-role"
                className="field"
                value={roleKey}
                onChange={(event) => {
                  const next = ROLE_KEYS.find((key) => key === event.target.value);
                  if (next) setRoleKey(next);
                }}
              >
                {ROLE_KEYS.map((key) => <option key={key} value={key}>{key}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-manager">Manager</Label>
              <select id="new-manager" data-testid="new-agent-manager" className="field" value={managerId} onChange={(event) => setManagerId(event.target.value)}>
                <option value="">No manager</option>
                {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.realName}</option>)}
              </select>
            </div>
            <Button type="submit" variant="outline" data-testid="add-agent">Add person</Button>
          </form>
        </aside>
      </div>

      {flows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Flow owners</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {flows.map((flow) => (
              <div key={flow.id} className="space-y-2 border-b pb-3 last:border-0">
                <p className="text-sm font-medium">{flow.name}</p>
                {LAYERS.map((layer) => {
                  const owner = flow.owners?.find((item) => item.layer === layer && item.role === 'owner')?.agentId ?? '';
                  const backup = flow.owners?.find((item) => item.layer === layer && item.role === 'backup')?.agentId ?? '';
                  const primary = (flow.layer ?? 'fullstack') === layer;
                  return (
                    <div key={layer} className="grid grid-cols-1 items-center gap-2 md:grid-cols-3">
                      <p className="text-sm capitalize text-muted-foreground">{layer}</p>
                      <select
                        aria-label={`${flow.name} ${layer} owner`}
                        data-testid={primary ? `flow-owner-${flow.flowKey}` : undefined}
                        className="field"
                        value={owner}
                        onChange={(event) => void setFlowOwner(flow, layer, 'owner', event.target.value)}
                      >
                        <option value="">No owner</option>
                        {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.realName}</option>)}
                      </select>
                      <select
                        aria-label={`${flow.name} ${layer} backup`}
                        data-testid={primary ? `flow-backup-${flow.flowKey}` : undefined}
                        className="field"
                        value={backup}
                        onChange={(event) => void setFlowOwner(flow, layer, 'backup', event.target.value)}
                      >
                        <option value="">No backup</option>
                        {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.realName}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
