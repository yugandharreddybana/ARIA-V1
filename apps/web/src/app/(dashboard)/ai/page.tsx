'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

// Sprint4 AI spec tests /ai — the actual page lives at /ai-strategy
// This redirect stub makes both routes work
export default function AIRedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/ai-strategy'); }, [router]);
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
