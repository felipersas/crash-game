'use client';

import { useQuery } from '@tanstack/react-query';
import { createGamesApi } from '@/infrastructure/api/games-api';
import type { RoundHistoryResponse } from '@/shared/schemas/api-schemas';

export function useRoundHistory({ page = 1, limit = 20 }: { page?: number; limit?: number } = {}) {
  return useQuery<RoundHistoryResponse>({
    queryKey: ['round-history', page, limit],
    queryFn: () => {
      const api = createGamesApi();
      return api.getRoundHistory({ page, limit });
    },
    staleTime: 10000,
  });
}
