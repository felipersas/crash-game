'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useVerifyRound } from '@/hooks/useVerifyRound';
import { computeSHA256 } from '@/utils/crypto';

const COPIED_FEEDBACK_MS = 2000;

/**
 * Provably-fair verification for a round: loads the revealed seed, lets the
 * player recompute SHA-256(seed) locally and compare it to the published hash.
 */
export function useSeedVerification(roundId: string) {
  const { data, isLoading, error } = useVerifyRound(roundId);
  const [computedHash, setComputedHash] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  const verify = useCallback(async () => {
    if (!data) return;
    setComputedHash(await computeSHA256(data.seed));
  }, [data]);

  const copyHash = useCallback(async () => {
    if (!data) return;
    await navigator.clipboard.writeText(data.seedHash);
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  }, [data]);

  return {
    data,
    isLoading,
    error,
    computedHash,
    hashesMatch: computedHash !== null && computedHash === data?.seedHash,
    copied,
    verify,
    copyHash,
  };
}
