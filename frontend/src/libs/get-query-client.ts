import { QueryClient, isServer } from "@tanstack/react-query";
import type { ApiError } from "@/libs/axios";

function isApiError(error: unknown): error is ApiError {
  return typeof error === "object" && error !== null && "status" in error;
}

/** Don't retry client errors (4xx); retry other failures up to twice. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export function getQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5000,
        gcTime: 300000,
        // Server prefetches must not delay rendering with retries.
        retry: isServer ? false : shouldRetry,
        refetchOnWindowFocus: false,
      },
    },
  });
}
