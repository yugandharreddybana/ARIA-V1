import type { ReactNode } from 'react';
import { BrainCircuit } from 'lucide-react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="mb-8 flex items-center gap-2.5">
        <BrainCircuit className="h-7 w-7 text-aria-500" />
        <span className="text-2xl font-bold tracking-tight">ARIA</span>
      </div>
      {children}
    </div>
  );
}
