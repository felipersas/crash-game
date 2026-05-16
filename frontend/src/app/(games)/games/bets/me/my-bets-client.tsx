"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { useMyBets } from "@/hooks/useMyBets";
import { formatMoney, formatMultiplier } from "@/domain/money";
import { BetStatus } from "@/types";
import { TableSkeleton } from "@/components/ui/Skeleton";

function statusBadge(status: string) {
  const map: Record<string, string> = {
    [BetStatus.CASHED_OUT]: "bg-primary/20 text-primary",
    [BetStatus.LOST]: "bg-error/20 text-error",
    [BetStatus.PENDING]: "bg-warning/20 text-warning",
    [BetStatus.ACTIVE]: "bg-warning/20 text-warning",
    [BetStatus.CANCELLED]: "bg-surface-bright/30 text-text-muted",
  };
  const labels: Record<string, string> = {
    [BetStatus.CASHED_OUT]: "WON",
    [BetStatus.LOST]: "LOST",
    [BetStatus.PENDING]: "PENDING",
    [BetStatus.ACTIVE]: "ACTIVE",
    [BetStatus.CANCELLED]: "CANCELLED",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-terminal uppercase ${map[status] || "bg-surface-bright/30 text-text-muted"}`}>
      {labels[status] || status}
    </span>
  );
}

export function MyBetsClient() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useMyBets({ page, limit: 20 });

  const bets = data?.data ?? [];
  const meta = data?.meta;
  const summary = data?.summary;
  const profitValue = summary ? Number(summary.profitCents) : 0;

  return (
    <>
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label="Total Wagered" value={formatMoney(summary.totalWageredCents)} icon={<Wallet className="w-4 h-4" />} />
          <SummaryCard label="Wins" value={String(summary.wins)} icon={<TrendingUp className="w-4 h-4 text-primary" />} valueClass="text-primary" />
          <SummaryCard label="Losses" value={String(summary.losses)} icon={<TrendingDown className="w-4 h-4 text-error" />} valueClass="text-error" />
          <SummaryCard label="Profit/Loss" value={formatMoney(Math.abs(profitValue))} icon={<Minus className="w-4 h-4" />} valueClass={profitValue >= 0 ? "text-primary" : "text-error"} prefix={profitValue >= 0 ? "+" : "-"} />
        </div>
      )}

      <div className="panel-cyber rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto] md:grid-cols-6 gap-2 px-4 py-3 bg-surface/50 border-b border-border text-xs font-terminal text-text-muted uppercase tracking-wider">
          <span>Round</span>
          <span>Amount</span>
          <span className="hidden md:block">Cashout</span>
          <span className="hidden md:block">Profit</span>
          <span>Status</span>
          <span className="hidden md:block text-right">Date</span>
        </div>

        {isLoading ? (
          <TableSkeleton rows={8} />
        ) : bets.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <p className="font-terminal text-text-muted text-sm">You haven&apos;t placed any bets yet</p>
            <Link href="/games" className="btn-cyber-primary px-6 py-2 rounded-lg text-sm font-terminal inline-block">
              Play Now
            </Link>
          </div>
        ) : (
          bets.map((bet) => (
            <div key={bet.id} className="grid grid-cols-[1fr_auto_auto_auto] md:grid-cols-6 gap-2 px-4 py-3 border-b border-border/50 hover:bg-surface/30 transition-colors items-center">
              <span className="font-terminal text-sm text-text-muted truncate" title={bet.roundId}>
                {bet.roundId.slice(0, 8)}...
              </span>
              <span className="font-terminal text-sm text-text-primary">{formatMoney(bet.amountCents)}</span>
              <span className="hidden md:block font-terminal text-sm text-text-primary">
                {bet.cashOutMultiplier ? formatMultiplier(bet.cashOutMultiplier) : "-"}
              </span>
              <span className={`hidden md:block font-terminal text-sm ${(bet.profitCents ?? 0) >= 0 ? "text-primary" : "text-error"}`}>
                {bet.profitCents != null ? formatMoney(bet.profitCents) : "-"}
              </span>
              <span>{statusBadge(bet.status)}</span>
              <span className="hidden md:block font-terminal text-xs text-text-muted text-right" title={bet.placedAt ? new Date(bet.placedAt).toLocaleString() : "-"}>
                {bet.placedAt ? new Date(bet.placedAt).toLocaleDateString() : "-"}
              </span>
            </div>
          ))
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-4">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-4 py-2 text-sm font-terminal text-text-muted border border-border rounded hover:border-primary hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            Previous
          </button>
          <span className="text-sm font-terminal text-text-muted">{page} / {meta.totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))} disabled={page >= meta.totalPages} className="px-4 py-2 text-sm font-terminal text-text-muted border border-border rounded hover:border-primary hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            Next
          </button>
        </div>
      )}
    </>
  );
}

function SummaryCard({ label, value, icon, valueClass = "text-text-primary", prefix = "" }: { label: string; value: string; icon: React.ReactNode; valueClass?: string; prefix?: string }) {
  return (
    <div className="panel-cyber p-4 space-y-2">
      <div className="flex items-center gap-2 text-text-muted">
        {icon}
        <span className="text-xs font-terminal uppercase tracking-wider">{label}</span>
      </div>
      <span className={`text-lg font-bold font-terminal ${valueClass}`}>{prefix}{value}</span>
    </div>
  );
}
