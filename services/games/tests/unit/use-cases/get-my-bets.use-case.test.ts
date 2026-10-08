import { describe, test, expect, beforeEach } from 'bun:test';
import { BetId, PlayerId, RoundId } from '@crash/domain';
import { GetMyBetsUseCase } from '../../../src/application/use-cases/get-my-bets.use-case';
import { Bet, BetStatus, type BetSnapshot } from '../../../src/domain/entities/bet.entity';
import { createMockBetRepository } from '../../helpers/mocks';

const PLAYER_ID = PlayerId.from('player-1');

function makeBet(overrides: Partial<BetSnapshot> & { status: BetStatus }): Bet {
  return Bet.restore({
    id: BetId.from(crypto.randomUUID()),
    roundId: RoundId.from(crypto.randomUUID()),
    playerId: PLAYER_ID,
    playerName: 'Player One',
    amountCents: 1000n,
    autoCashOutMultiplier: null,
    cashOutMultiplier: null,
    cashOutAmount: null,
    cashedOutAt: null,
    cancelReason: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });
}

describe('GetMyBetsUseCase', () => {
  let betRepository: ReturnType<typeof createMockBetRepository>;
  let useCase: GetMyBetsUseCase;

  beforeEach(() => {
    betRepository = createMockBetRepository();
    useCase = new GetMyBetsUseCase(betRepository as any);
  });

  test('should return paginated bets for the player', async () => {
    // Arrange
    const bet1 = makeBet({
      status: BetStatus.CASHED_OUT,
      cashOutMultiplier: 2.5,
      cashOutAmount: 2500n,
    });
    const bet2 = makeBet({ status: BetStatus.LOST });
    betRepository.findByPlayerPaginated.mockResolvedValue([bet1, bet2]);
    betRepository.countByPlayer.mockResolvedValue(10);

    // Act
    const result = await useCase.execute({ playerId: PLAYER_ID, page: 1, limit: 20 });

    // Assert
    expect(result.data.map((b) => b.id)).toEqual([bet1.id, bet2.id]);
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 10, totalPages: 1 });
  });

  test('should query the repositories for the given player with computed offset', async () => {
    // Act
    await useCase.execute({ playerId: PLAYER_ID, page: 2, limit: 15 });

    // Assert
    expect(betRepository.findByPlayerPaginated.calls).toEqual([[PLAYER_ID, 15, 15]]);
    expect(betRepository.countByPlayer.calls).toEqual([[PLAYER_ID]]);
    expect(betRepository.getSummaryByPlayer.calls).toEqual([[PLAYER_ID]]);
  });

  test('should map a cashed out bet with bigint money and positive profit', async () => {
    // Arrange
    const cashedOutAt = new Date('2026-01-01T00:00:05Z');
    const bet = makeBet({
      status: BetStatus.CASHED_OUT,
      cashOutMultiplier: 2.5,
      cashOutAmount: 2500n,
      cashedOutAt,
    });
    betRepository.findByPlayerPaginated.mockResolvedValue([bet]);

    // Act
    const result = await useCase.execute({ playerId: PLAYER_ID });

    // Assert
    expect(result.data[0]).toEqual({
      id: bet.id,
      roundId: bet.roundId,
      amountCents: 1000n,
      cashOutMultiplier: 2.5,
      payoutCents: 2500n,
      profitCents: 1500n,
      status: BetStatus.CASHED_OUT,
      cashedOutAt,
      placedAt: bet.getCreatedAt(),
    });
  });

  test('should report negative profit for lost bets', async () => {
    // Arrange
    betRepository.findByPlayerPaginated.mockResolvedValue([makeBet({ status: BetStatus.LOST })]);

    // Act
    const result = await useCase.execute({ playerId: PLAYER_ID });

    // Assert
    expect(result.data[0]!.profitCents).toBe(-1000n);
    expect(result.data[0]!.payoutCents).toBeNull();
    expect(result.data[0]!.cashOutMultiplier).toBeNull();
  });

  test('should report zero profit for pending, active and cancelled bets', async () => {
    // Arrange
    betRepository.findByPlayerPaginated.mockResolvedValue([
      makeBet({ status: BetStatus.PENDING }),
      makeBet({ status: BetStatus.ACTIVE }),
      makeBet({ status: BetStatus.CANCELLED, cancelReason: 'Insufficient funds' }),
    ]);

    // Act
    const result = await useCase.execute({ playerId: PLAYER_ID });

    // Assert
    expect(result.data.map((b) => b.profitCents)).toEqual([0n, 0n, 0n]);
  });

  test('should return the summary from the repository aggregate', async () => {
    // Arrange
    const summary = { totalWageredCents: 1800n, wins: 1, losses: 1, profitCents: 500n };
    betRepository.getSummaryByPlayer.mockResolvedValue(summary);

    // Act
    const result = await useCase.execute({ playerId: PLAYER_ID });

    // Assert
    expect(result.summary).toEqual(summary);
  });

  test('should handle an empty bet list', async () => {
    // Act
    const result = await useCase.execute({ playerId: PLAYER_ID });

    // Assert
    expect(result.data).toHaveLength(0);
    expect(result.meta.total).toBe(0);
    expect(result.meta.totalPages).toBe(0);
    expect(result.summary).toEqual({
      totalWageredCents: 0n,
      wins: 0,
      losses: 0,
      profitCents: 0n,
    });
  });

  test('should use default pagination when not provided', async () => {
    // Act
    const result = await useCase.execute({ playerId: PLAYER_ID });

    // Assert
    expect(result.meta.page).toBe(1);
    expect(result.meta.limit).toBe(20);
    expect(betRepository.findByPlayerPaginated.calls).toEqual([[PLAYER_ID, 20, 0]]);
  });
});
