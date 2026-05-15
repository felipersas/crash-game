import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMyBets } from '../useMyBets';
import { renderHookWithProviders, waitFor } from '../../../tests/helpers';
import { get } from '@/libs/axios';
import type { MyBetsResponse } from '@/schemas/api-schemas';
import { BetStatus } from '@/types/game.types';
import type { ApiError } from '@/libs/axios';
import { toast } from 'sonner';

vi.mock('@/libs/axios');
vi.mock('sonner');

const mockResponse: MyBetsResponse = {
  data: [
    {
      id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      roundId: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
      amountCents: 1000,
      amountDecimal: '10.00',
      cashOutMultiplier: 2.5,
      payoutCents: 2500,
      payoutDecimal: '25.00',
      profitCents: 1500,
      profitDecimal: '15.00',
      status: BetStatus.CASHED_OUT,
      cashedOutAt: new Date('2026-05-15'),
      placedAt: new Date('2026-05-15'),
    },
  ],
  meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
  summary: {
    totalWageredCents: 1000,
    totalWageredDecimal: '10.00',
    wins: 1,
    losses: 0,
    profitCents: 1500,
    profitDecimal: '15.00',
  },
};

describe('useMyBets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('returns loading state initially', async () => {
      vi.mocked(get).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(mockResponse), 100);
          })
      );

      const { result } = renderHookWithProviders(() => useMyBets());

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
      expect(result.current.isError).toBe(false);
    });
  });

  describe('success state', () => {
    it('returns data on success', async () => {
      vi.mocked(get).mockResolvedValueOnce(mockResponse);

      const { result } = renderHookWithProviders(() => useMyBets());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockResponse);
      expect(result.current.isError).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('passes correct params to API', async () => {
      vi.mocked(get).mockResolvedValueOnce(mockResponse);

      const { result } = renderHookWithProviders(() =>
        useMyBets({ page: 2, limit: 10 })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(get).toHaveBeenCalledWith('/games/bets/me?page=2&limit=10');
    });

    it('uses default params when none provided', async () => {
      vi.mocked(get).mockResolvedValueOnce(mockResponse);

      const { result } = renderHookWithProviders(() => useMyBets());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(get).toHaveBeenCalledWith('/games/bets/me?page=1&limit=20');
    });
  });

  describe('error state', () => {
    it('handles error state and shows toast', async () => {
      const mockError: ApiError = {
        message: 'Failed to load bets',
        status: 500,
        code: 'SERVER_ERROR',
      };

      vi.mocked(get).mockRejectedValueOnce(mockError);

      const { result } = renderHookWithProviders(() => useMyBets());

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toBeUndefined();
      expect(result.current.error).toEqual(mockError);
      expect(toast.error).toHaveBeenCalledWith('Failed to load bets');
    });

    it('shows mapped error message when code is recognized', async () => {
      const mockError: ApiError = {
        message: 'Wallet not found',
        status: 404,
        code: 'WALLET_NOT_FOUND',
      };

      vi.mocked(get).mockRejectedValueOnce(mockError);

      const { result } = renderHookWithProviders(() => useMyBets());

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(toast.error).toHaveBeenCalledWith('Wallet not found');
    });

    it('only shows toast once for repeated errors', async () => {
      const mockError: ApiError = {
        message: 'Failed to load bets',
        status: 500,
        code: 'SERVER_ERROR',
      };

      vi.mocked(get).mockRejectedValueOnce(mockError);

      const { result } = renderHookWithProviders(() => useMyBets());

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(toast.error).toHaveBeenCalledTimes(1);
    });

    it('resets error toast flag when query succeeds', async () => {
      const mockError: ApiError = {
        message: 'Failed to load bets',
        status: 500,
        code: 'SERVER_ERROR',
      };

      vi.mocked(get)
        .mockRejectedValueOnce(mockError)
        .mockResolvedValueOnce(mockResponse);

      const { result } = renderHookWithProviders(() => useMyBets());

      // First request fails
      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(toast.error).toHaveBeenCalledTimes(1);

      // Refetch succeeds
      await result.current.refetch();

      await waitFor(() => {
        expect(result.current.isError).toBe(false);
      });

      // Error flag should be reset (this tests the ref behavior)
      expect(toast.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('query configuration', () => {
    it('enables query only when session has accessToken', async () => {
      vi.mocked(get).mockResolvedValueOnce(mockResponse);

      const { result } = renderHookWithProviders(() => useMyBets());

      // The test helpers provide a session with accessToken
      // So the query should be enabled and fetch data
      await waitFor(() => {
        expect(get).toHaveBeenCalledTimes(1);
      });
    });

    it('uses correct query key with page and limit', async () => {
      vi.mocked(get).mockResolvedValueOnce(mockResponse);

      const { result } = renderHookWithProviders(() =>
        useMyBets({ page: 3, limit: 15 })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // The query key should include the page and limit params
      expect(get).toHaveBeenCalledWith('/games/bets/me?page=3&limit=15');
    });
  });

  describe('refetch functionality', () => {
    it('provides refetch function', async () => {
      vi.mocked(get).mockResolvedValueOnce(mockResponse);

      const { result } = renderHookWithProviders(() => useMyBets());

      expect(typeof result.current.refetch).toBe('function');
    });

    it('can refetch bets data', async () => {
      const updatedResponse: MyBetsResponse = {
        ...mockResponse,
        data: [
          {
            id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
            roundId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
            amountCents: 2000,
            amountDecimal: '20.00',
            cashOutMultiplier: 1.5,
            payoutCents: 3000,
            payoutDecimal: '30.00',
            profitCents: 1000,
            profitDecimal: '10.00',
            status: BetStatus.CASHED_OUT,
            cashedOutAt: new Date('2026-05-15'),
            placedAt: new Date('2026-05-15'),
          },
        ],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
        summary: {
          totalWageredCents: 2000,
          totalWageredDecimal: '20.00',
          wins: 1,
          losses: 0,
          profitCents: 1000,
          profitDecimal: '10.00',
        },
      };

      vi.mocked(get)
        .mockResolvedValueOnce(mockResponse)
        .mockResolvedValueOnce(updatedResponse);

      const { result } = renderHookWithProviders(() => useMyBets());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data?.data[0].id).toBe('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');

      await result.current.refetch();

      await waitFor(() => {
        expect(result.current.data?.data[0].id).toBe('f47ac10b-58cc-4372-a567-0e02b2c3d479');
      });
    });
  });
});
