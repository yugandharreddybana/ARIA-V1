'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

interface UiDiscoveryRecord {
  ticketId: string;
  audience: string;
  surface: string;
  tone: string;
  brandContext?: string;
  constraints: string[];
  successMetrics: string[];
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Turn-1 Discovery Form (V27.9 §14). Required before any UI ticket leaves the
 * backlog. Persists to /api/ui-discovery and mirrors to .entiresystem/ui_discovery/.
 */
export default function UiDiscoveryPage() {
  const params = useParams<{ ticket: string }>();
  const ticketId = decodeURIComponent(params.ticket);

  const [form, setForm] = useState<UiDiscoveryRecord>({
    ticketId, audience: '', surface: '', tone: '', brandContext: '',
    constraints: [], successMetrics: [],
  });
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const body = await api<{ success: true; data: UiDiscoveryRecord }>(`/ui-discovery/${ticketId}`);
      setForm(body.data);
    } catch {
      /* 404 is expected for a brand-new ticket */
    }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setSaved(false);
    try {
      await api('/ui-discovery', {
        method: 'POST',
        body: JSON.stringify({
          ticketId: form.ticketId,
          audience: form.audience,
          surface: form.surface,
          tone: form.tone,
          brandContext: form.brandContext || undefined,
          constraints: form.constraints,
          successMetrics: form.successMetrics,
        }),
      });
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-6" data-testid="ui-discovery-page">
      <Card>
        <CardHeader>
          <CardTitle>Turn-1 Discovery — {ticketId}</CardTitle>
          <CardDescription>Required before any UI work. Captured by the Product Architect / UX Defender.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-1.5">
              <Label htmlFor="audience">Audience</Label>
              <Input id="audience" data-testid="audience" required
                     value={form.audience}
                     onChange={(e) => setForm({ ...form, audience: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="surface">Surface</Label>
              <Input id="surface" data-testid="surface" required
                     value={form.surface}
                     onChange={(e) => setForm({ ...form, surface: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tone">Tone</Label>
              <Input id="tone" data-testid="tone" required
                     value={form.tone}
                     onChange={(e) => setForm({ ...form, tone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand">Brand context (optional)</Label>
              <Input id="brand" data-testid="brand"
                     value={form.brandContext ?? ''}
                     onChange={(e) => setForm({ ...form, brandContext: e.target.value })} />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" data-testid="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save discovery'}
              </Button>
              {saved && <span data-testid="saved" className="text-sm text-aria-300">Saved.</span>}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
