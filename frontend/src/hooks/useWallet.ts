"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getWallet } from "@/libs/wallets-api";
import type { Wallet } from "@/types";
import type { ApiError } from "@/libs/axios";
import { getErrorMessage } from "@/constants/error-codes";
import { toast } from "sonner";
import { useSession } from "next-auth/react";

export function useWallet() {
  const { data: session } = useSession();
  const hasShownError = useRef(false);

  const query = useQuery<Wallet>({
    queryKey: ["wallet"],
    queryFn: getWallet,
    enabled: !!session?.accessToken,
    staleTime: 5000,
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (query.isError && !hasShownError.current) {
      const error = query.error as unknown as ApiError;
      toast.error(getErrorMessage(error.code, "Failed to load wallet"));
      hasShownError.current = true;
    }
    if (!query.isError) {
      hasShownError.current = false;
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
