'use client';

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { getMyBets } from '@/libs/games-api';
import type { MyBetsResponse } from '@/types';
import type { ApiError } from '@/libs/axios';
import { getErrorMessage } from '@/constants/error-codes';
import { toast } from 'sonner';

export function useMyBets({ page = 1, limit = 20 }: { page?: number; limit?: number } = {}) {
  const { data: session } = useSession();
  const hasShownError = useRef(false);

  const query = useQuery<MyBetsResponse, ApiError>({
    queryKey: ['my-bets', page, limit],
    queryFn: () => getMyBets({ page, limit }),
    enabled: !!session?.accessToken,
    staleTime: 10000,
  });

  useEffect(() => {
    if (query.isError && !hasShownError.current) {
      toast.error(getErrorMessage(query.error.code, 'Failed to load bets'));
      hasShownError.current = true;
    }
    if (!query.isError) {
      hasShownError.current = false;
    }
  }, [query.isError, query.error]);

  return query;
}
