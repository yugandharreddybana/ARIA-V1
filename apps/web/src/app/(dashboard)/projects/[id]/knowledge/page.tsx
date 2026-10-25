'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorNote, LoadingState } from '@/components/ui/empty-state';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

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
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <PageHeader
        title="Knowledge map"
        description="What ARIA read from the repository: stack, flows, modules, and data."
        action={<Link href={`/projects/${params.id}/company`} className="text-sm text-primary">Org chart</Link>}
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data && !error && <LoadingState label="Loading the knowledge map…" />}
      {data && !data.map && !error && (
        <EmptyState title="No map yet" description="Finish setup and analyze a repository to build this map." />
      )}
      {data?.map && (
        <>
          <p data-testid="knowledge-summary" className="text-sm">{data.map.summary}</p>
          <section className="space-y-2">
            <h2 className="font-semibold">Tech stack</h2>
            <ul className="flex flex-wrap gap-2">
              {data.map.techStack.map((tech) => <li key={tech.name}><Badge>{tech.name}</Badge></li>)}
            </ul>
          </section>
          <section className="space-y-2">
            <h2 className="font-semibold">Business flows</h2>
            <Table>
              <THead><TR><TH>Flow</TH><TH>Kind</TH><TH>What it does</TH></TR></THead>
              <TBody>
                {data.flows.map((flow) => (
                  <TR key={flow.id} data-testid="knowledge-flow">
                    <TD className="font-medium">{flow.name}</TD>
                    <TD>{flow.kind}</TD>
                    <TD>{flow.description}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </section>
          <section className="space-y-2">
            <h2 className="font-semibold">Modules</h2>
            <ul className="space-y-1 text-sm">
              {data.map.modules.map((mod) => <li key={mod.path}>{mod.path} ({mod.fileCount})</li>)}
            </ul>
          </section>
          <section className="space-y-2">
            <h2 className="font-semibold">Data model</h2>
            <ul className="space-y-1 text-sm">
              {data.map.dataModel.map((entity) => <li key={entity.name}>{entity.name}</li>)}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
