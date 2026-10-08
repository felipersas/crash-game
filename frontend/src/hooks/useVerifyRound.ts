'use client';

import { useQuery } from '@tanstack/react-query';
import { verifyRound } from '@/libs/games-api';
import type { VerifyRoundResponse } from '@/types';
import type { ApiError } from '@/libs/axios';

export function useVerifyRound(roundId: string) {
  return useQuery<VerifyRoundResponse, ApiError>({
    queryKey: ['verify-round', roundId],
    queryFn: () => verifyRound(roundId),
    enabled: !!roundId,
    staleTime: Infinity,
  });
}
