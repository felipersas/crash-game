'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { createWalletsApi } from '../infrastructure/api/wallets-api';
import type { Wallet } from '../domain/types/game.types';

/**
 * Wallet hook
 *
 * Provides wallet data and balance information.
 * Auto-refreshes every 10 seconds to keep balance current.
 *
 * @example
 * ```ts
 * const { wallet, balance, isLoading } = useWallet();
 * console.log(`Current balance: $${balance}`);
 * ```
 */
export function useWallet() {
  const { data: session } = useSession();

  const query = useQuery<Wallet>({
    queryKey: ['wallet'],
    queryFn: () => {
      const api = createWalletsApi(session?.accessToken);
      return api.getWallet();
    },
    enabled: !!session?.accessToken,
    staleTime: 5000, // Consider data fresh for 5 seconds
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  return {
    wallet: query.data,
    balance: query.data?.balance ?? '0.00',
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
