'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Hash } from 'lucide-react';
import { useRoundHistory } from '@/hooks/useRoundHistory';
import { useGameStore } from '@/store/game-store';
import { RoundStatus } from '@/types';
import RoundHistoryTable from './RoundHistoryTable';
import VerificationModal from './VerificationModal';

export default function RoundHistory() {
  const [verifyRoundId, setVerifyRoundId] = useState<string | null>(null);
  const roundStatus = useGameStore((s) => s.roundStatus);
  const queryClient = useQueryClient();
  const prevStatus = useRef(roundStatus);

  // Refetch round history when round crashes
  useEffect(() => {
    if (roundStatus === RoundStatus.CRASHED && prevStatus.current !== RoundStatus.CRASHED) {
      queryClient.invalidateQueries({ queryKey: ['round-history'] });
    }
    prevStatus.current = roundStatus;
  }, [roundStatus, queryClient]);

  const { data, isLoading } = useRoundHistory({ page: 1, limit: 10 });
  const rounds = data?.data ?? [];

  return (
    <div className="panel-cyber rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-terminal uppercase tracking-wider text-primary">
          Round History
        </span>
        <div className="flex items-center gap-1 text-xs text-text-muted">
          <Hash className="w-3 h-3" />
          <span>Provably Fair</span>
        </div>
      </div>

      <RoundHistoryTable
        rounds={rounds}
        isLoading={isLoading}
        onVerify={setVerifyRoundId}
      />

      {verifyRoundId && (
        <VerificationModal
          roundId={verifyRoundId}
          onClose={() => setVerifyRoundId(null)}
        />
      )}
    </div>
  );
}
