'use client';

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { getMyBets } from '@/infrastructure/api/games-api';
import type { MyBetsResponse } from '@/shared/schemas/api-schemas';
import type { ApiError } from '@/infrastructure/api/http-client';
import { getErrorMessage } from '@/shared/constants/error-codes';
import { toast } from 'sonner';

export function useMyBets({ page = 1, limit = 20 }: { page?: number; limit?: number } = {}) {
  const { data: session } = useSession();
  const hasShownError = useRef(false);

  const query = useQuery<MyBetsResponse>({
    queryKey: ['my-bets', page, limit],
    queryFn: () => getMyBets({ page, limit }),
    enabled: !!session?.accessToken,
    staleTime: 10000,
  });

  useEffect(() => {
    if (query.isError && !hasShownError.current) {
      const error = query.error as unknown as ApiError;
      toast.error(getErrorMessage(error.code, 'Failed to load bets'));
      hasShownError.current = true;
    }
    if (!query.isError) {
      hasShownError.current = false;
    }
  }, [query.isError, query.error]);

  return query;
}
