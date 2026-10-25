import { cn } from '@/lib/utils';

const tones = {
  neutral: 'bg-muted text-foreground',
  accent: 'bg-primary/10 text-primary',
  ok: 'bg-secondary text-foreground',
  warn: 'bg-muted text-foreground',
  off: 'bg-muted text-muted-foreground',
} as const;

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', tones[tone], className)}>
      {children}
    </span>
  );
}
