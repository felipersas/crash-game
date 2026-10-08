import { describe, test, expect, beforeEach } from 'bun:test';
import { Money, PlayerId } from '@crash/domain';
import { GetCurrentRoundUseCase } from '../../../src/application/use-cases/get-current-round.use-case';
import { Round, RoundStatus } from '../../../src/domain/entities/round.entity';
import { BetStatus } from '../../../src/domain/entities/bet.entity';
import { RoundNotFoundError } from '../../../src/domain/errors/domain.errors';
import { createMockRoundRepository, createMockRoundStateProvider } from '../../helpers/mocks';

/** Persisted copy of a round, as the repository would return it (multiplier back at 1.0). */
function persistedCopyOf(round: Round): Round {
  return Round.restore(round.toPersistence(), round.getBets());
}

describe('GetCurrentRoundUseCase', () => {
  let roundRepository: ReturnType<typeof createMockRoundRepository>;
  let roundStateProvider: ReturnType<typeof createMockRoundStateProvider>;
  let useCase: GetCurrentRoundUseCase;

  beforeEach(() => {
    roundRepository = createMockRoundRepository();
    roundStateProvider = createMockRoundStateProvider();
    useCase = new GetCurrentRoundUseCase(roundRepository as any, roundStateProvider as any);
  });

  test('should return the current round state without revealing the crash point', async () => {
    // Arrange
    const round = await Round.create();
    roundRepository.findCurrentRound.mockResolvedValue(round);

    // Act
    const result = await useCase.execute({});

    // Assert
    expect(result.roundId).toBe(round.id);
    expect(result.status).toBe(RoundStatus.BETTING);
    expect(result.crashPoint).toBeNull();
    expect(result.seedHash).toBe(round.getSeedHash());
    expect(result.currentMultiplier).toBe(1);
    expect(result.bettingEndTime).toBeInstanceOf(Date);
    expect(result.startedAt).toBeNull();
    expect(result.crashedAt).toBeNull();
  });

  test('should never reveal the crash point of an active round', async () => {
    // Arrange
    const round = await Round.create(undefined, 'test-crash-10.0');
    await round.startRound();
    roundRepository.findCurrentRound.mockResolvedValue(round);

    // Act
    const result = await useCase.execute({});

    // Assert
    expect(result.status).toBe(RoundStatus.ACTIVE);
    expect(result.crashPoint).toBeNull();
    expect(result.startedAt).toBeInstanceOf(Date);
  });

  test('should report the live multiplier when the live round is the current round', async () => {
    // Arrange
    const liveRound = await Round.create(undefined, 'test-crash-10.0');
    await liveRound.startRound();
    liveRound.updateMultiplier(5);
    const persistedRound = persistedCopyOf(liveRound);
    roundRepository.findCurrentRound.mockResolvedValue(persistedRound);
    roundStateProvider.getCurrentRound.mockReturnValue(liveRound);

    // Act
    const result = await useCase.execute({});

    // Assert
    expect(persistedRound.getCurrentMultiplier()).toBe(1);
    expect(result.currentMultiplier).toBeGreaterThan(1);
    expect(result.currentMultiplier).toBe(liveRound.getCurrentMultiplier());
    expect(roundStateProvider.getCurrentRound.callCount).toBe(1);
  });

  test('should report the persisted multiplier when the live round is a different round', async () => {
    // Arrange
    const liveRound = await Round.create(undefined, 'test-crash-10.0');
    await liveRound.startRound();
    liveRound.updateMultiplier(5);
    const otherRound = await Round.create();
    roundRepository.findCurrentRound.mockResolvedValue(otherRound);
    roundStateProvider.getCurrentRound.mockReturnValue(liveRound);

    // Act
    const result = await useCase.execute({});

    // Assert
    expect(result.roundId).toBe(otherRound.id);
    expect(result.currentMultiplier).toBe(1);
  });

  test('should report the persisted multiplier when there is no live round', async () => {
    // Arrange
    const round = await Round.create(undefined, 'test-crash-10.0');
    await round.startRound();
    roundRepository.findCurrentRound.mockResolvedValue(persistedCopyOf(round));

    // Act
    const result = await useCase.execute({});

    // Assert
    expect(result.currentMultiplier).toBe(1);
  });

  test('should include bets with bigint money when includeBets is true', async () => {
    // Arrange
    const round = await Round.create();
    round.placeBet(PlayerId.from('player-1'), 'Player One', Money.fromDecimal('10.00'), 2);
    round.placeBet(PlayerId.from('player-2'), 'Player Two', Money.fromDecimal('20.00'));
    roundRepository.findCurrentRound.mockResolvedValue(round);

    // Act
    const result = await useCase.execute({ includeBets: true });

    // Assert
    expect(result.bets).toHaveLength(2);
    const first = result.bets.find((b) => b.playerId === 'player-1')!;
    expect(first.id).toBe(round.getBetByPlayer(PlayerId.from('player-1'))!.id);
    expect(first.playerName).toBe('Player One');
    expect(first.amountCents).toBe(1000n);
    expect(first.status).toBe(BetStatus.PENDING);
    expect(first.autoCashOutMultiplier).toBe(2);
    expect(first.cashOutMultiplier).toBeNull();
    expect(first.cashOutAmountCents).toBeNull();
    expect(first.cashedOutAt).toBeNull();
    const second = result.bets.find((b) => b.playerId === 'player-2')!;
    expect(second.amountCents).toBe(2000n);
    expect(second.autoCashOutMultiplier).toBeNull();
  });

  test('should exclude bets when includeBets is false', async () => {
    // Arrange
    const round = await Round.create();
    round.placeBet(PlayerId.from('player-1'), 'Player One', Money.fromDecimal('10.00'));
    roundRepository.findCurrentRound.mockResolvedValue(round);

    // Act
    const result = await useCase.execute({ includeBets: false });

    // Assert
    expect(result.bets).toHaveLength(0);
  });

  test('should exclude bets when no input is given', async () => {
    // Arrange
    const round = await Round.create();
    round.placeBet(PlayerId.from('player-1'), 'Player One', Money.fromDecimal('10.00'));
    roundRepository.findCurrentRound.mockResolvedValue(round);

    // Act
    const result = await useCase.execute();

    // Assert
    expect(result.bets).toHaveLength(0);
  });

  test('should map cash out data of a cashed out bet', async () => {
    // Arrange
    const p1 = PlayerId.from('player-1');
    const round = await Round.create(undefined, 'test-crash-10.0');
    round.placeBet(p1, 'Player One', Money.fromDecimal('10.00'));
    round.getBetByPlayer(p1)!.confirm();
    await round.startRound();
    round.updateMultiplier(5);
    const payout = round.cashOut(p1);
    roundRepository.findCurrentRound.mockResolvedValue(round);

    // Act
    const result = await useCase.execute({ includeBets: true });

    // Assert
    expect(result.bets).toHaveLength(1);
    const bet = result.bets[0]!;
    expect(bet.status).toBe(BetStatus.CASHED_OUT);
    expect(bet.cashOutMultiplier).toBe(round.getCurrentMultiplier());
    expect(bet.cashOutMultiplier).toBeGreaterThan(1);
    expect(bet.cashOutAmountCents).toBe(payout.toCents());
    expect(typeof bet.cashOutAmountCents).toBe('bigint');
    expect(bet.cashedOutAt).toBeInstanceOf(Date);
  });

  test('should throw RoundNotFoundError when there is no current round', async () => {
    // Arrange
    roundRepository.findCurrentRound.mockResolvedValue(null);

    // Act & Assert
    await expect(useCase.execute({})).rejects.toThrow(RoundNotFoundError);
    expect(roundStateProvider.getCurrentRound.callCount).toBe(0);
  });
});
