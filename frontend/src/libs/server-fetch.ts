/**
 * Server-side fetch utilities for TanStack Query prefetch.
 * These return the same data shapes as the client-side API functions
 * but use native fetch + getServerSession instead of axios + getSession.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function serverGet<T>(path: string, token?: string, revalidate: number = 10): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    headers,
    next: { revalidate },
  });
  if (!res.ok) throw new Error(`Server fetch failed: ${res.status}`);
  return res.json();
}

/** Public — round history (no auth required) */
export function fetchRoundHistory(params: { page?: number; limit?: number }) {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  return serverGet(`/games/rounds/history?page=${page}&limit=${limit}`);
}

/** Public — round verification (no auth required) */
export function fetchVerifyRound(roundId: string) {
  return serverGet(`/games/rounds/${roundId}/verify`);
}

/** Authenticated — my bets (requires access token) */
export function fetchMyBets(params: { page?: number; limit?: number }, token: string) {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  return serverGet(`/games/bets/me?page=${page}&limit=${limit}`, token);
}
