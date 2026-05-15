import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWallet } from '../useWallet';
import { renderHookWithProviders, waitFor } from '../../../tests/helpers';
import { get } from '@/libs/axios';
import type { Wallet } from '@/types/game.types';
import { toast } from 'sonner';

vi.mock('@/libs/axios');
vi.mock('sonner');

const mockWallet: Wallet = {
  walletId: 'wallet-1',
  playerId: 'player-1',
  balance: '100.00',
  version: 1,
};

describe('useWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('returns loading state initially', async () => {
      vi.mocked(get).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(mockWallet), 100);
          })
      );

      const { result } = renderHookWithProviders(() => useWallet());

      expect(result.current.isLoading).toBe(true);
      expect(result.current.wallet).toBeUndefined();
      expect(result.current.balance).toBe('0.00');
      expect(result.current.isError).toBe(false);
    });
  });

  describe('success state', () => {
    it('returns wallet data on success', async () => {
      vi.mocked(get).mockResolvedValueOnce(mockWallet);

      const { result } = renderHookWithProviders(() => useWallet());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.wallet).toEqual(mockWallet);
      expect(result.current.balance).toBe('100.00');
      expect(result.current.isError).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('returns balance string from wallet data', async () => {
      vi.mocked(get).mockResolvedValueOnce(mockWallet);

      const { result } = renderHookWithProviders(() => useWallet());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.balance).toBe('100.00');
    });

    it('returns default balance "0.00" when no wallet data', async () => {
      vi.mocked(get).mockResolvedValueOnce(null as unknown as Wallet);

      const { result } = renderHookWithProviders(() => useWallet());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.balance).toBe('0.00');
    });
  });

  describe('error state', () => {
    it('handles error state and shows toast', async () => {
      const mockError = {
        message: 'Wallet not found',
        status: 404,
        code: 'WALLET_NOT_FOUND',
      };

      vi.mocked(get).mockRejectedValueOnce(mockError);

      const { result } = renderHookWithProviders(() => useWallet());

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.wallet).toBeUndefined();
      expect(result.current.balance).toBe('0.00');
      expect(result.current.error).toEqual(mockError);
      expect(toast.error).toHaveBeenCalledWith('Wallet not found');
    });

    it('shows generic error message when code is not mapped', async () => {
      const mockError = {
        message: 'Unknown error',
        status: 500,
        code: 'UNKNOWN_ERROR',
      };

      vi.mocked(get).mockRejectedValueOnce(mockError);

      const { result } = renderHookWithProviders(() => useWallet());

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(toast.error).toHaveBeenCalledWith('Failed to load wallet');
    });

    it('only shows toast once for repeated errors', async () => {
      const mockError = {
        message: 'Wallet not found',
        status: 404,
        code: 'WALLET_NOT_FOUND',
      };

      vi.mocked(get).mockRejectedValueOnce(mockError);

      const { result } = renderHookWithProviders(() => useWallet());

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(toast.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('refetch functionality', () => {
    it('provides refetch function', async () => {
      vi.mocked(get).mockResolvedValueOnce(mockWallet);

      const { result } = renderHookWithProviders(() => useWallet());

      expect(typeof result.current.refetch).toBe('function');
    });

    it('can refetch wallet data', async () => {
      vi.mocked(get)
        .mockResolvedValueOnce(mockWallet)
        .mockResolvedValueOnce({
          ...mockWallet,
          balance: '150.00',
        });

      const { result } = renderHookWithProviders(() => useWallet());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.balance).toBe('100.00');

      await result.current.refetch();

      await waitFor(() => {
        expect(result.current.balance).toBe('150.00');
      });
    });
  });

  describe('query configuration', () => {
    it('enables query only when session has accessToken', async () => {
      vi.mocked(get).mockResolvedValueOnce(mockWallet);

      const { result } = renderHookWithProviders(() => useWallet());

      // The test helpers provide a session with accessToken
      // So the query should be enabled and fetch data
      await waitFor(() => {
        expect(get).toHaveBeenCalledTimes(1);
      });
    });
  });
});
