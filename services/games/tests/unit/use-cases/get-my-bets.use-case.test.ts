import { describe, test, expect, beforeEach } from 'bun:test';
import { GetMyBetsUseCase } from '../../../src/application/use-cases/get-my-bets.use-case';
import { Bet, BetStatus } from '../../../src/domain/entities/bet.entity';

function mockFn<T extends (...args: any[]) => any>(
  impl?: T,
): T & { mockReturnValue: (v: any) => void; mockResolvedValue: (v: any) => void } {
  const fn: any = (...args: any[]) => fn._impl(...args);
  fn._impl = impl || (() => {});
  fn.mockReturnValue = (v: any) => {
    fn._impl = () => v;
  };
  fn.mockResolvedValue = (v: any) => {
    fn._impl = () => Promise.resolve(v);
  };
  return fn;
}

const PLAYER_ID = 'player-1';
const PLAYER_NAME = 'Player One';

function makeBet(overrides: {
  id?: string;
  roundId?: string;
  playerId?: string;
  playerName?: string;
  amountCents?: bigint;
  status: BetStatus;
  cashOutMultiplier?: number | null;
  cashOutAmountCents?: bigint | null;
  cashedOutAt?: Date | null;
  createdAt?: Date;
}): Bet {
  return Bet.restore(
    overrides.id ?? crypto.randomUUID(),
    overrides.roundId ?? crypto.randomUUID(),
    overrides.playerId ?? PLAYER_ID,
    overrides.playerName ?? PLAYER_NAME,
    overrides.amountCents ?? 1000n,
    overrides.status,
    overrides.cashOutMultiplier ?? null,
    overrides.cashOutAmountCents ?? null,
    overrides.cashedOutAt ?? null,
    overrides.createdAt,
  );
}

describe('GetMyBetsUseCase', () => {
  let useCase: GetMyBetsUseCase;
  let mockBetRepo: any;

  beforeEach(() => {
    mockBetRepo = {
      findByPlayerPaginated: mockFn(async () => []),
      countByPlayer: mockFn(async () => 0),
      getSummaryByPlayer: mockFn(async () => ({
        totalWageredCents: 0,
        wins: 0,
        losses: 0,
        profitCents: 0,
      })),
    };
    useCase = new GetMyBetsUseCase(mockBetRepo);
  });

  test('Should return paginated bets for player', async () => {
    const bet1 = makeBet({
      status: BetStatus.CASHED_OUT,
      cashOutMultiplier: 2.5,
      cashOutAmountCents: 2500n,
    });
    const bet2 = makeBet({ status: BetStatus.LOST });

    mockBetRepo.findByPlayerPaginated.mockResolvedValue([bet1, bet2]);
    mockBetRepo.countByPlayer.mockResolvedValue(10);

    const result = await useCase.execute({ playerId: PLAYER_ID, page: 1, limit: 20 });

    expect(result.data).toHaveLength(2);
    expect(result.meta.page).toBe(1);
    expect(result.meta.total).toBe(10);
  });

  test('Should compute correct pagination metadata', async () => {
    mockBetRepo.countByPlayer.mockResolvedValue(45);

    const result = await useCase.execute({ playerId: PLAYER_ID, page: 2, limit: 20 });

    expect(result.meta.page).toBe(2);
    expect(result.meta.limit).toBe(20);
    expect(result.meta.total).toBe(45);
    expect(result.meta.totalPages).toBe(3);
  });

  test('Should calculate profit for cashed out bets', async () => {
    const bet = makeBet({
      status: BetStatus.CASHED_OUT,
      cashOutMultiplier: 2.5,
      cashOutAmountCents: 2500n,
    });

    mockBetRepo.findByPlayerPaginated.mockResolvedValue([bet]);
    mockBetRepo.countByPlayer.mockResolvedValue(1);

    const result = await useCase.execute({ playerId: PLAYER_ID });

    expect(result.data[0].profitCents).toBe(1500);
  });

  test('Should calculate negative profit for lost bets', async () => {
    const bet = makeBet({ status: BetStatus.LOST });

    mockBetRepo.findByPlayerPaginated.mockResolvedValue([bet]);
    mockBetRepo.countByPlayer.mockResolvedValue(1);

    const result = await useCase.execute({ playerId: PLAYER_ID });

    expect(result.data[0].profitCents).toBe(-1000);
  });

  test('Should return zero profit for pending bets', async () => {
    const bet = makeBet({ status: BetStatus.PENDING });

    mockBetRepo.findByPlayerPaginated.mockResolvedValue([bet]);
    mockBetRepo.countByPlayer.mockResolvedValue(1);

    const result = await useCase.execute({ playerId: PLAYER_ID });

    expect(result.data[0].profitCents).toBe(0);
  });

  test('Should return summary from repository aggregate', async () => {
    mockBetRepo.getSummaryByPlayer.mockResolvedValue({
      totalWageredCents: 1800,
      wins: 1,
      losses: 1,
      profitCents: 500,
    });

    const result = await useCase.execute({ playerId: PLAYER_ID });

    expect(result.summary.totalWageredCents).toBe(1800);
    expect(result.summary.wins).toBe(1);
    expect(result.summary.losses).toBe(1);
    expect(result.summary.profitCents).toBe(500);
  });

  test('Should handle empty bet list', async () => {
    const result = await useCase.execute({ playerId: PLAYER_ID });

    expect(result.data).toHaveLength(0);
    expect(result.meta.total).toBe(0);
    expect(result.meta.totalPages).toBe(0);
    expect(result.summary.totalWageredCents).toBe(0);
    expect(result.summary.wins).toBe(0);
    expect(result.summary.losses).toBe(0);
    expect(result.summary.profitCents).toBe(0);
  });

  test('Should use default pagination when not provided', async () => {
    const result = await useCase.execute({ playerId: PLAYER_ID });

    expect(result.meta.page).toBe(1);
    expect(result.meta.limit).toBe(20);
  });
});
