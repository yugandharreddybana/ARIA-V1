'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface ProviderInfo {
  id: string;
  label: string;
  canPlan: boolean;
  canCode: boolean;
  needsApiKey: boolean;
  defaultModel: string;
  binary: string | null;
  installSteps: string[];
  envKeyHint: string | null;
}

export interface CredentialRow {
  id: string;
  provider: string;
  label: string;
  connectionStatus: string;
  binaryStatus: string;
  lastTestedAt: string | null;
  lastError: string | null;
  installSteps: string[];
  canPlan: boolean;
  canCode: boolean;
  hasApiKey: boolean;
  retiredAt: string | null;
}

interface CredentialsResponse {
  credentials: CredentialRow[];
  activePlanningCredentialId: string | null;
  activeCodingCredentialId: string | null;
}

interface Props {
  mode?: 'setup' | 'settings';
  projectId?: string;
  onReadyChange?: (ready: boolean) => void;
}

export function ProviderCredentialsPanel({ mode = 'settings', projectId, onReadyChange }: Props) {
  const [planningProviders, setPlanningProviders] = useState<ProviderInfo[]>([]);
  const [codingProviders, setCodingProviders] = useState<ProviderInfo[]>([]);
  const [credentials, setCredentials] = useState<CredentialRow[]>([]);
  const [activePlanning, setActivePlanning] = useState<string | null>(null);
  const [activeCoding, setActiveCoding] = useState<string | null>(null);
  const [tier, setTier] = useState<'planning' | 'coding'>('planning');
  const [provider, setProvider] = useState('cursor');
  const [label, setLabel] = useState('default');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const lists = tier === 'planning' ? planningProviders : codingProviders;
  const selected = lists.find((item) => item.id === provider) ?? lists[0];

  const refresh = useCallback(async () => {
    const [plan, code, creds] = await Promise.all([
      api<{ providers: ProviderInfo[] }>('/providers?tier=planning'),
      api<{ providers: ProviderInfo[] }>('/providers?tier=coding'),
      api<CredentialsResponse>('/providers/credentials'),
    ]);
    setPlanningProviders(plan.providers);
    setCodingProviders(code.providers);
    setCredentials(creds.credentials.filter((row) => !row.retiredAt));
    setActivePlanning(creds.activePlanningCredentialId);
    setActiveCoding(creds.activeCodingCredentialId);
    const ready = Boolean(creds.activePlanningCredentialId && creds.activeCodingCredentialId);
    onReadyChange?.(ready);
  }, [onReadyChange]);

  useEffect(() => {
    refresh().catch(() => setError('Could not load providers.'));
  }, [refresh]);

  useEffect(() => {
    const first = (tier === 'planning' ? planningProviders : codingProviders)[0];
    if (first && !lists.some((item) => item.id === provider)) {
      setProvider(first.id);
    }
  }, [tier, planningProviders, codingProviders, lists, provider]);

  async function createAndTest() {
    setBusy(true); setError(''); setMessage('');
    try {
      let credentialId: string;
      try {
        const created = await api<{ credential: CredentialRow }>('/providers/credentials', {
          method: 'POST',
          body: JSON.stringify({
            provider,
            label: label.trim() || 'default',
            apiKey: apiKey || undefined,
            baseUrl: selected?.id === 'ollama' || selected?.id === 'openai_compatible' || selected?.id === 'custom'
              ? (baseUrl || undefined)
              : undefined,
          }),
        });
        credentialId = created.credential.id;
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 409) throw err;
        const existing = credentials.find((row) => row.provider === provider && row.label === (label.trim() || 'default'));
        if (!existing) throw err;
        credentialId = existing.id;
      }
      const tested = await api<{ result: { ok: boolean; message: string; installSteps?: string[] }; credential: CredentialRow }>(
        `/providers/credentials/${credentialId}/test`,
        { method: 'POST', body: JSON.stringify({ apiKey: apiKey || undefined }) },
      );
      setMessage(tested.result.message);
      if (!tested.result.ok) {
        setError(tested.result.message);
        if (tested.credential.binaryStatus === 'missing') {
          setError((tested.result.installSteps || tested.credential.installSteps).join(' · '));
        }
        await refresh();
        return;
      }
      await api(`/providers/credentials/${credentialId}/activate`, {
        method: 'POST',
        body: JSON.stringify({ tier, ...(projectId ? { projectId } : {}) }),
      });
      // First canCode choice also fills the empty coding slot (no product-default provider).
      if (tier === 'planning' && tested.credential.canCode && tested.credential.binaryStatus !== 'missing') {
        try {
          await api(`/providers/credentials/${credentialId}/activate`, {
            method: 'POST',
            body: JSON.stringify({ tier: 'coding', ...(projectId ? { projectId } : {}) }),
          });
        } catch {
          // Coding activate may need a separate key/binary; planning still succeeded.
        }
      }
      setApiKey('');
      await refresh();
      setMessage(`${selected?.label ?? provider} activated for ${tier}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the credential');
    } finally {
      setBusy(false);
    }
  }

  async function activate(id: string, nextTier: 'planning' | 'coding') {
    setBusy(true); setError('');
    try {
      await api(`/providers/credentials/${id}/activate`, {
        method: 'POST',
        body: JSON.stringify({ tier: nextTier, ...(projectId ? { projectId } : {}) }),
      });
      await refresh();
      setMessage(`Activated for ${nextTier}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not activate');
    } finally {
      setBusy(false);
    }
  }

  async function retire(id: string) {
    setBusy(true); setError('');
    try {
      await api(`/providers/credentials/${id}/retire`, { method: 'POST' });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not retire');
    } finally {
      setBusy(false);
    }
  }

  async function retest(id: string) {
    setBusy(true); setError(''); setMessage('');
    try {
      const tested = await api<{ result: { ok: boolean; message: string } }>(
        `/providers/credentials/${id}/test`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      setMessage(tested.result.message);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Test failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="provider-credentials-panel">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={tier === 'planning' ? 'aria' : 'outline'} data-testid="tier-tab-planning" onClick={() => setTier('planning')}>
          Planning
        </Button>
        <Button type="button" variant={tier === 'coding' ? 'aria' : 'outline'} data-testid="tier-tab-coding" onClick={() => setTier('coding')}>
          Coding
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {tier === 'planning'
          ? 'Any planning-capable provider. There is no product default — your first choice becomes the project default.'
          : 'Coding list shows only canCode providers. Ollama and chat-only providers are omitted.'}
      </p>
      <div className="flex flex-wrap gap-2" data-testid={`provider-list-${tier}`}>
        {lists.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant={provider === item.id ? 'aria' : 'outline'}
            data-testid={`provider-${item.id}`}
            onClick={() => setProvider(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      {selected?.installSteps?.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground" data-testid="binary-install-steps">
          {selected.installSteps.map((step) => <li key={step}>{step}</li>)}
        </ul>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cred-label">Label</Label>
          <Input id="cred-label" data-testid="credential-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="personal" />
        </div>
        {selected?.needsApiKey !== false && (
          <div className="space-y-1.5">
            <Label htmlFor="cred-key">API key</Label>
            <Input
              id="cred-key"
              data-testid={mode === 'setup' ? 'llm-api-key' : 'credential-api-key'}
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={selected?.envKeyHint ?? 'API key'}
            />
          </div>
        )}
        {(selected?.id === 'ollama' || selected?.id === 'openai_compatible' || selected?.id === 'custom') && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cred-base">Base URL</Label>
            <Input
              id="cred-base"
              data-testid={mode === 'setup' ? 'llm-base-url' : 'credential-base-url'}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
        )}
      </div>
      <Button type="button" variant="aria" data-testid="test-connection" disabled={busy} onClick={() => void createAndTest()}>
        Test Connection & activate
      </Button>
      {message && <p data-testid="test-connection-result" className="text-sm text-muted-foreground">{message}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="space-y-2" data-testid="credential-list">
        {credentials.map((row) => {
          const isPlan = activePlanning === row.id;
          const isCode = activeCoding === row.id;
          return (
            <div
              key={row.id}
              className={cn('flex flex-wrap items-center gap-2 border border-border px-3 py-2 text-sm')}
              data-testid={`credential-${row.provider}-${row.label}`}
            >
              <span className="font-medium">{row.provider}</span>
              <span className="text-muted-foreground">{row.label}</span>
              <span data-testid={`credential-status-${row.id}`}>{row.connectionStatus}</span>
              <span data-testid={`credential-binary-${row.id}`}>{row.binaryStatus}</span>
              {isPlan && <span data-testid="active-planning-badge">planning</span>}
              {isCode && <span data-testid="active-coding-badge">coding</span>}
              <Button type="button" size="sm" variant="outline" disabled={busy || row.connectionStatus !== 'ok' || !row.canPlan} onClick={() => void activate(row.id, 'planning')}>
                Use for planning
              </Button>
              {row.canCode && (
                <Button type="button" size="sm" variant="outline" disabled={busy || row.connectionStatus !== 'ok'} onClick={() => void activate(row.id, 'coding')}>
                  Use for coding
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void retest(row.id)}>Retest</Button>
              <Button type="button" size="sm" variant="outline" disabled={busy || isPlan || isCode} onClick={() => void retire(row.id)}>Retire</Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
