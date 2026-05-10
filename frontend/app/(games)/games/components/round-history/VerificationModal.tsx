'use client';

import { useState } from 'react';
import { Copy, Check, Shield, X } from 'lucide-react';
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
        className="panel-cyber max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
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
            <div className="space-y-3 font-terminal text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">Round ID:</span>
                <span className="text-text-primary text-xs">{data.roundId.slice(0, 12)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Crash Point:</span>
                <span className="text-primary font-bold">{formatMultiplier(data.crashPoint)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Seed:</span>
                <span className="text-text-primary text-xs break-all max-w-[200px]">{data.seed}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Salt:</span>
                <span className="text-text-primary text-xs">{data.salt}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-muted">Hash:</span>
                <div className="flex items-center gap-2">
                  <span className="text-text-primary text-xs">{data.seedHash.slice(0, 16)}...</span>
                  <button onClick={handleCopy} className="text-primary hover:text-primary/80">
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>
              {data.verificationFormula && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Formula:</span>
                  <span className="text-text-primary text-xs">{data.verificationFormula}</span>
                </div>
              )}
            </div>

            <button
              onClick={handleVerify}
              className="w-full btn-cyber-primary py-2 rounded-lg text-sm uppercase tracking-widest"
            >
              Verify (SHA-256)
            </button>

            {computedHash && (
              <div className="space-y-2 pt-3 border-t border-border">
                <p className="text-xs text-text-muted font-terminal">Computed hash: <span className="text-text-primary break-all">{computedHash}</span></p>
                <p className={`text-center py-2 rounded font-terminal text-sm ${hashesMatch ? 'bg-primary/20 text-primary' : 'bg-error/20 text-error'}`}>
                  {hashesMatch ? 'Verified!' : 'Hashes do not match'}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
