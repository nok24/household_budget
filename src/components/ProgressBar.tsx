import { cn } from '@/lib/utils';

interface Props {
  pct: number;
  compact?: boolean;
  className?: string;
}

export default function ProgressBar({ pct, compact, className }: Props) {
  const clamped = Math.max(0, Math.min(100, pct));
  const over = pct > 100;
  return (
    <div
      className={cn(
        'w-full bg-canvas rounded-full overflow-hidden border border-line',
        compact ? 'h-1' : 'h-1.5',
        className,
      )}
    >
      <div
        className={cn('h-full transition-all', over ? 'bg-rose-600' : 'bg-accent')}
        style={{ width: `${over ? 100 : clamped}%` }}
      />
    </div>
  );
}
