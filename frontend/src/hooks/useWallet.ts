"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getWallet } from "@/libs/wallets-api";
import type { Wallet } from "@/types";
import type { ApiError } from "@/libs/axios";
import { getErrorMessage } from "@/constants/error-codes";
import { toast } from "sonner";
import { useSession } from "next-auth/react";

export const WALLET_QUERY_KEY = ["wallet"] as const;

export function useWallet() {
  const { data: session } = useSession();
  const hasShownError = useRef(false);

  const query = useQuery<Wallet, ApiError>({
    queryKey: WALLET_QUERY_KEY,
    queryFn: getWallet,
    enabled: !!session?.accessToken,
    staleTime: 5000,
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (query.isError && !hasShownError.current) {
      toast.error(getErrorMessage(query.error.code, "Failed to load wallet"));
      hasShownError.current = true;
    }
    if (!query.isError) {
      hasShownError.current = false;
    }
  }, [query.isError, query.error]);

  return {
    wallet: query.data,
    /** Balance in integer cents as a string (e.g. "50000" = $500.00). */
    balanceCents: query.data?.balance ?? "0",
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
