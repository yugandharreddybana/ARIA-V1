'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="p-6" role="alert">
      <h2 className="text-lg font-semibold">This page hit an error</h2>
      <p className="mt-2 text-sm text-muted-foreground">A live update could not be shown. The rest of the app is still available.</p>
      <Button className="mt-4" type="button" onClick={() => reset()}>Try again</Button>
    </div>
  );
}
