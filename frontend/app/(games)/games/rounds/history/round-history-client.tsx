"use client";

import { useState } from "react";
import { useRoundHistory } from "@/hooks/useRoundHistory";
import RoundHistoryTable from "../../_components/round-history/RoundHistoryTable";
import VerificationModal from "../../_components/round-history/VerificationModal";

export function RoundHistoryClient() {
  const [page, setPage] = useState(1);
  const [verifyRoundId, setVerifyRoundId] = useState<string | null>(null);
  const { data, isLoading } = useRoundHistory({ page, limit: 20 });

  const rounds = data?.data ?? [];
  const meta = data?.meta;

  return (
    <>
      <div className="panel-cyber rounded-lg overflow-hidden">
        <RoundHistoryTable
          rounds={rounds}
          isLoading={isLoading}
          onVerify={setVerifyRoundId}
          emptyMessage="No rounds found"
        />
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-4 py-2 text-sm font-terminal text-text-muted border border-border rounded hover:border-primary hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-sm font-terminal text-text-muted">
            {page} / {meta.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
            disabled={page >= meta.totalPages}
            className="px-4 py-2 text-sm font-terminal text-text-muted border border-border rounded hover:border-primary hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {verifyRoundId && (
        <VerificationModal
          roundId={verifyRoundId}
          onClose={() => setVerifyRoundId(null)}
        />
      )}
    </>
  );
}
