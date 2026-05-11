'use client';

import { useState } from 'react';
import { Copy, Check, Shield, X, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useVerifyRound } from '@/hooks/useVerifyRound';
import { computeSHA256 } from '@/shared/utils/crypto';
import { formatMultiplier } from '@/shared/utils/money';
import { InlineSkeleton } from '@/components/ui/skeleton';

interface VerificationModalProps {
  roundId: string;
  onClose: () => void;
}

export default function VerificationModal({ roundId, onClose }: VerificationModalProps) {
  const { data, isLoading, error } = useVerifyRound(roundId);
  const [computedHash, setComputedHash] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

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

  const hashesMatch = computedHash === data?.seedHash;

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="panel-cyber max-w-md w-full p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary shrink-0" />
            <h4 className="text-lg font-black font-terminal uppercase text-primary">
              Verify Round
            </h4>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="py-6">
            <InlineSkeleton />
          </div>
        ) : error || !data ? (
          <p className="text-sm font-terminal text-error text-center py-4">Failed to load data</p>
        ) : (
          <>
            {/* How to verify */}
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
              <button
                onClick={() => setShowHelp(!showHelp)}
                className="flex items-center gap-2 w-full text-left text-sm font-terminal text-primary/80 hover:text-primary transition-colors"
              >
                <HelpCircle className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-xs uppercase tracking-wider">How verification works</span>
                {showHelp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showHelp && (
                <div className="mt-3 space-y-2 text-xs font-terminal text-text-secondary leading-relaxed">
                  <p>
                    Each round uses a <span className="text-text-primary">seed</span> predetermined before the round starts.
                    The server publishes a <span className="text-text-primary">hash</span> of that seed as a commitment.
                  </p>
                  <ol className="list-decimal list-inside space-y-1.5 pl-1">
                    <li>
                      <span className="text-text-primary">Before the round</span> — Server publishes the hash (commitment)
                    </li>
                    <li>
                      <span className="text-text-primary">After crash</span> — Server reveals the original seed
                    </li>
                    <li>
                      <span className="text-text-primary">You verify</span> — Compute SHA-256(seed) and check it matches the published hash
                    </li>
                    <li>
                      <span className="text-text-primary">Crash point</span> — Derived from the same seed using a deterministic formula (first 52 bits of hash)
                    </li>
                  </ol>
                  <p className="text-text-muted pt-1">
                    If the hashes match, the server cannot have changed the outcome after seeing bets.
                  </p>
                </div>
              )}
            </div>

            {/* Data rows */}
            <div className="space-y-3 font-terminal text-sm">
              <DataRow label="Round ID" value={data.roundId} />
              <DataRow label="Crash Point" value={formatMultiplier(data.crashPoint)} highlight />
              <DataRow label="Seed" value={data.seed} mono />
              <DataRow label="Salt" value={data.salt} mono />
              <DataRow
                label="Hash"
                value={data.seedHash}
                mono
                action={
                  <button
                    onClick={handleCopy}
                    className="text-primary hover:text-primary/80 shrink-0"
                    title="Copy hash"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </button>
                }
              />
              {data.verificationFormula && (
                <DataRow label="Formula" value={data.verificationFormula} mono />
              )}
            </div>

            {/* Verify button */}
            <button
              onClick={handleVerify}
              className="w-full btn-cyber-primary py-2.5 rounded-lg text-sm uppercase tracking-widest"
            >
              Verify (SHA-256)
            </button>

            {/* Result */}
            {computedHash && (
              <div className="space-y-2 pt-3 border-t border-border">
                <div>
                  <span className="text-xs text-text-muted font-terminal uppercase tracking-wider">
                    Computed hash
                  </span>
                  <p className="font-terminal text-text-primary text-xs break-all mt-1">
                    {computedHash}
                  </p>
                </div>
                <div
                  className={`text-center py-2.5 rounded-lg font-terminal text-sm uppercase tracking-wider ${
                    hashesMatch
                      ? 'bg-primary/20 text-primary'
                      : 'bg-error/20 text-error'
                  }`}
                >
                  {hashesMatch ? 'Verified! Hashes match.' : 'Hashes do not match.'}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DataRow({
  label,
  value,
  mono,
  highlight,
  action,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-text-muted text-xs uppercase tracking-wider">{label}</span>
      <div className="flex items-start gap-2">
        <span
          className={`break-all leading-relaxed ${
            highlight
              ? 'text-primary font-bold'
              : mono
                ? 'text-text-primary text-xs'
                : 'text-text-primary'
          }`}
        >
          {value}
        </span>
        {action}
      </div>
    </div>
  );
}
