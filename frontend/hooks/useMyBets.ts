'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { createGamesApi } from '@/infrastructure/api/games-api';
import type { MyBetsResponse } from '@/shared/schemas/api-schemas';

export function useMyBets({ page = 1, limit = 20 }: { page?: number; limit?: number } = {}) {
  const { data: session } = useSession();

  return useQuery<MyBetsResponse>({
    queryKey: ['my-bets', page, limit],
    queryFn: () => {
      const api = createGamesApi(session?.accessToken);
      return api.getMyBets({ page, limit });
    },
    enabled: !!session?.accessToken,
    staleTime: 10000,
  });
}
