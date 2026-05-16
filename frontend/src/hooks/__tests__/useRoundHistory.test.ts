import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHookWithProviders, waitFor } from '../../../tests/helpers';
import { get } from '@/libs/axios';
import { useRoundHistory } from '../useRoundHistory';
import { RoundStatus, type RoundHistoryResponse } from '@/types';

vi.mock('@/libs/axios');

describe('useRoundHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns loading state initially', () => {
    const { result } = renderHookWithProviders(() => useRoundHistory());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeNull();
  });

  it('returns data on success with mock RoundHistoryResponse', async () => {
    const mockResponse: RoundHistoryResponse = {
      data: [
        {
          roundId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          crashPoint: 2.5,
          status: RoundStatus.CRASHED,
          startedAt: new Date('2026-05-15'),
          crashedAt: new Date('2026-05-15'),
          totalBets: 10,
          totalWageredCents: 5000,
          totalWageredDecimal: '50.00',
        },
      ],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    };

    vi.mocked(get).mockResolvedValueOnce(mockResponse);

    const { result } = renderHookWithProviders(() => useRoundHistory());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockResponse);
    expect(result.current.error).toBeNull();
  });

  it('passes page and limit params to the API call', async () => {
    const mockResponse: RoundHistoryResponse = {
      data: [],
      meta: { page: 2, limit: 10, total: 0, totalPages: 0 },
    };

    vi.mocked(get).mockResolvedValueOnce(mockResponse);

    renderHookWithProviders(() => useRoundHistory({ page: 2, limit: 10 }));

    await waitFor(() => {
      expect(get).toHaveBeenCalledTimes(1);
    });

    expect(get).toHaveBeenCalledWith('/games/rounds/history?page=2&limit=10');
  });

  it('uses default params when page and limit are not provided', async () => {
    const mockResponse: RoundHistoryResponse = {
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    };

    vi.mocked(get).mockResolvedValueOnce(mockResponse);

    renderHookWithProviders(() => useRoundHistory());

    await waitFor(() => {
      expect(get).toHaveBeenCalledTimes(1);
    });

    expect(get).toHaveBeenCalledWith('/games/rounds/history?page=1&limit=20');
  });
});
