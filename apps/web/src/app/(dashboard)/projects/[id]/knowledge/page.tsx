'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';

interface KnowledgeResponse {
  map: {
    summary: string;
    techStack: Array<{ name: string }>;
    modules: Array<{ name: string; path: string; fileCount: number }>;
    dataModel: Array<{ name: string }>;
    apis: Array<{ method: string; path: string }>;
  } | null;
  flows: Array<{ id: string; name: string; kind: string; description: string; ownerAgentId: string | null }>;
}

export default function KnowledgePage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<KnowledgeResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<KnowledgeResponse>(`/projects/${params.id}/knowledge`)
      .then(setData)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Could not load the knowledge map'));
  }, [params.id]);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Knowledge map</h1>
        <Link href={`/projects/${params.id}/company`} className="text-sm text-aria-400">Org chart</Link>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!data?.map && !error && <p className="text-sm text-muted-foreground">No map yet. Finish setup to analyze a repository.</p>}
      {data?.map && (
        <>
          <p data-testid="knowledge-summary" className="text-sm">{data.map.summary}</p>
          <section>
            <h2 className="font-semibold mb-2">Tech stack</h2>
            <ul className="flex flex-wrap gap-2">
              {data.map.techStack.map((tech) => <li key={tech.name} className="text-sm border border-border rounded-md px-2 py-1">{tech.name}</li>)}
            </ul>
          </section>
          <section>
            <h2 className="font-semibold mb-2">Business flows</h2>
            <ul className="space-y-2">
              {data.flows.map((flow) => (
                <li key={flow.id} data-testid="knowledge-flow" className="border border-border rounded-md p-3 text-sm">
                  <p className="font-medium">{flow.name} · {flow.kind}</p>
                  <p className="text-muted-foreground">{flow.description}</p>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="font-semibold mb-2">Modules</h2>
            <ul className="text-sm space-y-1">
              {data.map.modules.map((mod) => <li key={mod.path}>{mod.path} ({mod.fileCount})</li>)}
            </ul>
          </section>
          <section>
            <h2 className="font-semibold mb-2">Data model</h2>
            <ul className="text-sm space-y-1">
              {data.map.dataModel.map((entity) => <li key={entity.name}>{entity.name}</li>)}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
