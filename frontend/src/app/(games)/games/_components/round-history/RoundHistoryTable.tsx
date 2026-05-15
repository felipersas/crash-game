"use client";

import { Hash } from 'lucide-react';
import { formatMultiplier, formatMoney } from '@/domain/money';
import { TableSkeleton } from '@/components/ui/Skeleton';

export interface RoundHistoryItem {
  roundId: string;
  crashPoint: number | null;
  crashedAt: Date | string | null;
  totalBets: number;
  totalWageredCents?: number;
}

interface RoundHistoryTableProps {
  rounds: RoundHistoryItem[];
  isLoading?: boolean;
  onVerify?: (roundId: string) => void;
  emptyMessage?: string;
}

function getCrashColor(cp: number | null): string {
  if (!cp) return 'text-text-muted';
  if (cp < 1.5) return 'text-error';
  if (cp < 3) return 'text-warning';
  return 'text-primary';
}

function getCrashBg(cp: number | null): string {
  if (!cp) return 'bg-surface-bright/30';
  if (cp < 1.5) return 'bg-error/20';
  if (cp < 3) return 'bg-warning/20';
  return 'bg-primary/20';
}

export default function RoundHistoryTable({
  rounds,
  isLoading,
  onVerify,
  emptyMessage = 'No rounds yet',
}: RoundHistoryTableProps) {
  if (isLoading) {
    return <TableSkeleton rows={5} />;
  }

  if (rounds.length === 0) {
    return (
      <div className="py-12 text-center text-text-muted font-terminal text-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      {/* Table Header */}
      <div className="grid grid-cols-[1fr_auto_auto] md:grid-cols-6 gap-2 px-4 py-3 bg-surface/50 border-b border-border text-xs font-terminal text-text-muted uppercase tracking-wider">
        <span>ID</span>
        <span className="hidden md:block">Date</span>
        <span className="hidden md:block">Bets</span>
        <span className="hidden md:block">Volume</span>
        <span>Crash</span>
        <span className="text-right">Verify</span>
      </div>

      {/* Rows */}
      {rounds.map((round) => (
        <div
          key={round.roundId}
          className="grid grid-cols-[1fr_auto_auto] md:grid-cols-6 gap-2 px-4 py-3 border-b border-border/50 hover:bg-surface/30 transition-colors items-center"
        >
          <span className="font-terminal text-sm text-text-muted truncate" title={round.roundId}>
            {round.roundId.slice(0, 8)}...
          </span>
          <span className="hidden md:block font-terminal text-xs text-text-muted" title={round.crashedAt ? new Date(round.crashedAt).toLocaleString() : '-'}>
            {round.crashedAt ? new Date(round.crashedAt).toLocaleDateString() : '-'}
          </span>
          <span className="hidden md:block font-terminal text-sm text-text-primary">
            {round.totalBets}
          </span>
          <span className="hidden md:block font-terminal text-sm text-text-primary">
            {round.totalWageredCents ? formatMoney(round.totalWageredCents) : '-'}
          </span>
          <span className={`font-terminal text-sm font-bold ${getCrashColor(round.crashPoint)}`}>
            <span className={`inline-block px-2 py-0.5 rounded ${getCrashBg(round.crashPoint)}`}>
              {formatMultiplier(round.crashPoint || 0)}
            </span>
          </span>
          <span className="text-right">
            <button
              onClick={() => onVerify?.(round.roundId)}
              className="inline-flex items-center gap-1 text-xs font-terminal text-primary hover:text-primary/80 transition-colors"
            >
              <Hash className="w-3 h-3" />
              Verify
            </button>
          </span>
        </div>
      ))}
    </>
  );
}
