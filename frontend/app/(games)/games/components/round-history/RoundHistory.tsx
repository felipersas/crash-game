'use client';

import { History, Hash } from 'lucide-react';
import { formatMultiplier } from '@/shared/utils/money';
import { useState } from 'react';
import { useRoundHistory } from '@/hooks/useRoundHistory';
import VerificationModal from './VerificationModal';

function getCrashTextColor(cp: number | null): string {
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

export default function RoundHistory() {
  const [verifyRoundId, setVerifyRoundId] = useState<string | null>(null);
  const { data, isLoading } = useRoundHistory({ page: 1, limit: 10 });
  const rounds = data?.data ?? [];

  return (
    <div className="panel-cyber rounded-lg p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-black font-terminal uppercase tracking-wider text-primary">
            History
          </h3>
        </div>
        <div className="flex items-center gap-1 text-xs text-text-muted">
          <Hash className="w-3 h-3" />
          <span>Provably Fair</span>
        </div>
      </div>

      {/* Chips row */}
      <div className="flex items-center gap-2 flex-wrap">
        {isLoading ? (
          <span className="text-xs font-terminal text-text-muted">Loading...</span>
        ) : rounds.length === 0 ? (
          <span className="text-xs font-terminal text-text-muted">No rounds yet</span>
        ) : (
          rounds.map((round) => (
            <button
              key={round.roundId}
              onClick={() => setVerifyRoundId(round.roundId)}
              className={`px-3 py-1 text-xs font-terminal rounded cursor-pointer hover:opacity-80 transition-opacity ${getCrashBg(round.crashPoint)} ${getCrashTextColor(round.crashPoint)}`}
            >
              {formatMultiplier(round.crashPoint || 0)}
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-border">
        <p className="text-xs font-terminal text-text-muted text-center">
          {rounds.length > 0 ? `Showing last ${rounds.length} rounds` : 'No history'}
        </p>
      </div>

      {/* Verification Modal */}
      {verifyRoundId && (
        <VerificationModal
          roundId={verifyRoundId}
          onClose={() => setVerifyRoundId(null)}
        />
      )}
    </div>
  );
}
