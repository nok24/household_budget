import { cn } from '@/lib/utils';
import type { PaceTone } from '@/lib/budget';

/**
 * 予算消化ペース判定の小さなバッジ。Budget / Dashboard / Categories で使い回す。
 */
export default function PaceBadge({
  tone,
  children,
  compact,
}: {
  tone: PaceTone;
  children: React.ReactNode;
  /** さらに小さい表示 (Dashboard / Categories のセル内向け) */
  compact?: boolean;
}) {
  const cls =
    tone === 'over'
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : tone === 'fast'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : tone === 'slow'
          ? 'bg-accent/10 text-accent border-accent/20'
          : 'bg-canvas text-ink-60 border-line';
  return (
    <span
      className={cn(
        'inline-block font-medium rounded-sm border',
        compact ? 'text-[9px] px-1 py-0' : 'text-[10px] px-1.5 py-[1px]',
        cls,
      )}
    >
      {children}
    </span>
  );
}
