"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { useVerifyRound } from "@/hooks/useVerifyRound";
import { computeSHA256 } from "@/shared/utils/crypto";
import { formatMultiplier } from "@/shared/utils/money";
import Link from "next/link";

export function VerifyRoundClient({ roundId }: { roundId: string }) {
  const { data, isLoading, error } = useVerifyRound(roundId);
  const [computedHash, setComputedHash] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleVerify = async () => {
    if (!data) return;
    const hash = await computeSHA256(data.seed);
    setComputedHash(hash);
  };

  const handleCopy = async () => {
    if (!data) return;
    await navigator.clipboard.writeText(data.seedHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <p className="font-terminal text-text-muted text-center py-8">Verifying...</p>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center space-y-4 py-8">
        <p className="font-terminal text-error">
          {error ? "Failed to load verification data" : "Data not found"}
        </p>
        <Link href="/games/rounds/history" className="text-primary hover:text-primary/80 font-terminal text-sm">
          Back to History
        </Link>
      </div>
    );
  }

  const hashesMatch = computedHash === data.seedHash;

  return (
    <>
      <div className="space-y-4 font-terminal text-sm">
        <InfoRow label="Round ID" value={data.roundId} />
        <InfoRow label="Crash Point" value={formatMultiplier(data.crashPoint)} />
        <InfoRow label="Seed" value={data.seed} mono />
        <InfoRow label="Salt" value={data.salt} mono />
        <InfoRow label="Hash (Server)" value={data.seedHash} mono />
        {data.verificationFormula && (
          <InfoRow label="Formula" value={data.verificationFormula} />
        )}
      </div>

      <button
        onClick={handleCopy}
        className="flex items-center gap-2 text-sm font-terminal text-primary hover:text-primary/80 transition-colors"
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copied ? "Copied!" : "Copy hash"}
      </button>

      <button
        onClick={handleVerify}
        className="w-full btn-cyber-primary py-3 rounded-lg text-sm uppercase tracking-widest"
      >
        Verify Now (SHA-256)
      </button>

      {computedHash && (
        <div className="space-y-3 pt-4 border-t border-border">
          <div>
            <span className="text-xs text-text-muted font-terminal uppercase">Computed hash:</span>
            <p className="font-terminal text-text-primary text-xs break-all mt-1">{computedHash}</p>
          </div>
          <div className={`text-center py-3 rounded-lg font-terminal text-sm uppercase tracking-wider ${hashesMatch ? "bg-primary/20 text-primary" : "bg-error/20 text-error"}`}>
            {hashesMatch ? "Verified! Hashes match." : "Hashes do not match."}
          </div>
        </div>
      )}
    </>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
      <span className="text-text-muted uppercase tracking-wider">{label}:</span>
      <span className={`text-text-primary break-all ${mono ? "text-xs" : ""}`}>{value}</span>
    </div>
  );
}
