import Link from 'next/link';
import { BrainCircuit } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="absolute inset-0 bg-grid opacity-50 pointer-events-none" />
      <nav className="relative z-10 border-b border-border/30 bg-background/60 backdrop-blur-sm">
        <div className="container flex items-center h-14">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <BrainCircuit className="h-5 w-5 text-aria-500" />
            <span className="font-bold text-sm tracking-tight">ARIA</span>
          </Link>
        </div>
      </nav>
      <div className="relative z-10 flex-1 flex items-center justify-center py-12 px-4">
        {children}
      </div>
    </div>
  );
}
