import { describe, test, expect, beforeEach } from 'bun:test';
import { Money, PlayerId } from '@crash/domain';
import { GetRoundHistoryUseCase } from '../../../src/application/use-cases/get-round-history.use-case';
import { Round, RoundStatus } from '../../../src/domain/entities/round.entity';
import { createMockRoundRepository } from '../../helpers/mocks';

interface BetSpec {
  playerId: string;
  amount: string;
  /** Leave the bet PENDING so the crash cancels it. */
  unconfirmed?: boolean;
}

async function createCrashedRound(bets: BetSpec[]): Promise<Round> {
  const round = await Round.create(undefined, 'test-crash-10.0');
  for (const spec of bets) {
    const playerId = PlayerId.from(spec.playerId);
    round.placeBet(playerId, `Name ${spec.playerId}`, Money.fromDecimal(spec.amount));
    if (!spec.unconfirmed) {
      round.getBetByPlayer(playerId)!.confirm();
    }
  }
  await round.startRound();
  round.crash();
  round.pullEvents();
  return round;
}

describe('GetRoundHistoryUseCase', () => {
  let roundRepository: ReturnType<typeof createMockRoundRepository>;
  let useCase: GetRoundHistoryUseCase;

  beforeEach(() => {
    roundRepository = createMockRoundRepository();
    useCase = new GetRoundHistoryUseCase(roundRepository as any);
  });

  test('should return paginated round history', async () => {
    // Arrange
    const round1 = await createCrashedRound([{ playerId: 'p1', amount: '10.00' }]);
    const round2 = await createCrashedRound([{ playerId: 'p2', amount: '20.00' }]);
    roundRepository.findHistory.mockResolvedValue([round1, round2]);
    roundRepository.countHistory.mockResolvedValue(25);

    // Act
    const result = await useCase.execute({ page: 1, limit: 20 });

    // Assert
    expect(result.data.map((r) => r.roundId)).toEqual([round1.id, round2.id]);
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 25, totalPages: 2 });
  });

  test('should query the repository with limit and offset derived from the page', async () => {
    // Act
    await useCase.execute({ page: 3, limit: 10 });

    // Assert
    expect(roundRepository.findHistory.calls).toEqual([[10, 20]]);
    expect(roundRepository.countHistory.callCount).toBe(1);
  });

  test('should map rounds to summaries with bigint wagered totals', async () => {
    // Arrange
    const round = await createCrashedRound([
      { playerId: 'p1', amount: '10.00' },
      { playerId: 'p2', amount: '20.00' },
    ]);
    roundRepository.findHistory.mockResolvedValue([round]);
    roundRepository.countHistory.mockResolvedValue(1);

    // Act
    const result = await useCase.execute({});

    // Assert
    expect(result.data).toHaveLength(1);
    const summary = result.data[0]!;
    expect(summary.roundId).toBe(round.id);
    expect(summary.status).toBe(RoundStatus.CRASHED);
    expect(summary.crashPoint).toBe(round.getCrashPoint());
    expect(summary.startedAt).toBeInstanceOf(Date);
    expect(summary.crashedAt).toBeInstanceOf(Date);
    expect(summary.totalBets).toBe(2);
    expect(summary.totalWageredCents).toBe(3000n);
  });

  test('should exclude cancelled bets from round totals', async () => {
    // Arrange: p2 never got wallet confirmation, so the crash cancels it
    const round = await createCrashedRound([
      { playerId: 'p1', amount: '10.00' },
      { playerId: 'p2', amount: '50.00', unconfirmed: true },
    ]);
    roundRepository.findHistory.mockResolvedValue([round]);
    roundRepository.countHistory.mockResolvedValue(1);

    // Act
    const result = await useCase.execute({});

    // Assert
    expect(round.getBetByPlayer(PlayerId.from('p2'))!.isCancelled()).toBe(true);
    expect(result.data[0]!.totalBets).toBe(1);
    expect(result.data[0]!.totalWageredCents).toBe(1000n);
  });

  test('should report zero totals for a round without bets', async () => {
    // Arrange
    const round = await createCrashedRound([]);
    roundRepository.findHistory.mockResolvedValue([round]);
    roundRepository.countHistory.mockResolvedValue(1);

    // Act
    const result = await useCase.execute({});

    // Assert
    expect(result.data[0]!.totalBets).toBe(0);
    expect(result.data[0]!.totalWageredCents).toBe(0n);
  });

  test('should compute pagination metadata', async () => {
    // Arrange
    roundRepository.countHistory.mockResolvedValue(50);

    // Act
    const result = await useCase.execute({ page: 3, limit: 10 });

    // Assert
    expect(result.meta).toEqual({ page: 3, limit: 10, total: 50, totalPages: 5 });
  });

  test('should handle empty history', async () => {
    // Act
    const result = await useCase.execute({});

    // Assert
    expect(result.data).toHaveLength(0);
    expect(result.meta.total).toBe(0);
    expect(result.meta.totalPages).toBe(0);
  });

  test('should use default pagination when not provided', async () => {
    // Act
    const result = await useCase.execute();

    // Assert
    expect(result.meta.page).toBe(1);
    expect(result.meta.limit).toBe(20);
    expect(roundRepository.findHistory.calls).toEqual([[20, 0]]);
  });
});
