'use client';

import { useQuery } from '@tanstack/react-query';
import { verifyRound } from '@/libs/games-api';

export function useVerifyRound(roundId: string) {
  return useQuery({
    queryKey: ['verify-round', roundId],
    queryFn: () => verifyRound(roundId),
    enabled: !!roundId,
    staleTime: Infinity,
  });
}
