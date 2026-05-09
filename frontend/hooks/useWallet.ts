"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { createWalletsApi } from "../infrastructure/api/wallets-api";
import type { Wallet } from "../types/game.types";
import type { ApiError } from "../infrastructure/api/http-client";
import { getErrorMessage } from "../shared/constants/error-codes";
import { toast } from "sonner";

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
    queryKey: ["wallet"],
    queryFn: () => {
      const api = createWalletsApi(session?.accessToken);
      return api.getWallet();
    },
    enabled: !!session?.accessToken,
    staleTime: 5000,
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (query.isError) {
      const error = query.error as unknown as ApiError;
      toast.error(getErrorMessage(error.code, "Failed to load wallet"));
    }
  }, [query.isError, query.error]);

  return {
    wallet: query.data,
    balance: query.data?.balance ?? "0.00",
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
