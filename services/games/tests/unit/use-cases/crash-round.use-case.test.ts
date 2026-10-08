import { describe, test, expect, beforeEach } from 'bun:test';
import { Money, PlayerId } from '@crash/domain';
import { CrashRoundUseCase } from '../../../src/application/use-cases/crash-round.use-case';
import { Round, RoundStatus } from '../../../src/domain/entities/round.entity';
import { Bet, BetStatus } from '../../../src/domain/entities/bet.entity';
import type { RoundCrashedEvent } from '../../../src/domain/events/round.events';
import { RoundNotFoundError } from '../../../src/domain/errors/domain.errors';
import {
  FAKE_TX,
  createMockBetRepository,
  createMockBroadcaster,
  createMockMetrics,
  createMockRoundRepository,
  createMockUnitOfWork,
} from '../../helpers/mocks';

const LOSER = PlayerId.from('player-loser');
const WINNER = PlayerId.from('player-winner');
const UNCONFIRMED = PlayerId.from('player-unconfirmed');

/**
 * Live ACTIVE round with: an ACTIVE bet (10.00), a cashed out bet (20.00)
 * and a PENDING bet the wallet never confirmed (30.00).
 */
async function createActiveRoundWithBets(): Promise<Round> {
  const round = await Round.create(undefined, 'test-crash-10.0');
  round.placeBet(LOSER, 'Loser', Money.fromDecimal('10.00'));
  round.placeBet(WINNER, 'Winner', Money.fromDecimal('20.00'));
  round.placeBet(UNCONFIRMED, 'Unconfirmed', Money.fromDecimal('30.00'));
  round.getBetByPlayer(LOSER)!.confirm();
  round.getBetByPlayer(WINNER)!.confirm();
  await round.startRound();
  round.updateMultiplier(5);
  round.cashOut(WINNER);
  round.pullEvents();
  return round;
}

/** Independent copy of the round (and its bets) as loaded from the database. */
function persistedCopyOf(round: Round): Round {
  const bets = round.getBets().map((bet) => Bet.restore(bet.toPersistence()));
  return Round.restore(round.toPersistence(), bets);
}

describe('CrashRoundUseCase', () => {
  let roundRepository: ReturnType<typeof createMockRoundRepository>;
  let betRepository: ReturnType<typeof createMockBetRepository>;
  let unitOfWork: ReturnType<typeof createMockUnitOfWork>;
  let broadcaster: ReturnType<typeof createMockBroadcaster>;
  let metrics: ReturnType<typeof createMockMetrics>;
  let useCase: CrashRoundUseCase;

  let liveRound: Round;
  let dbRound: Round;

  beforeEach(async () => {
    roundRepository = createMockRoundRepository();
    betRepository = createMockBetRepository();
    unitOfWork = createMockUnitOfWork();
    broadcaster = createMockBroadcaster();
    metrics = createMockMetrics();
    useCase = new CrashRoundUseCase(
      roundRepository as any,
      betRepository as any,
      unitOfWork as any,
      broadcaster as any,
      metrics as any,
    );

    liveRound = await createActiveRoundWithBets();
    dbRound = persistedCopyOf(liveRound);
    roundRepository.findById.mockResolvedValue(dbRound);
  });

  test('should reload the round from the database and crash it', async () => {
    // Act
    const result = await useCase.execute({ round: liveRound });

    // Assert
    expect(roundRepository.findById.calls).toEqual([[liveRound.id]]);
    expect(result.round).toBe(dbRound);
    expect(dbRound.getStatus()).toBe(RoundStatus.CRASHED);
    expect(dbRound.getCrashedAt()).toBeInstanceOf(Date);
  });

  test('should commit the round, settled bets and events in a single commit', async () => {
    // Act
    await useCase.execute({ round: liveRound });

    // Assert
    expect(unitOfWork.commit.callCount).toBe(1);
    expect(unitOfWork.commits[0]!.aggregateId).toBe(dbRound.id);
    expect(roundRepository.save.calls).toEqual([[dbRound, FAKE_TX]]);

    const updated = betRepository.update.calls.map(([bet, tx]) => {
      expect(tx).toBe(FAKE_TX);
      return bet as Bet;
    });
    expect(updated.map((bet) => [bet.playerId, bet.getStatus()])).toEqual([
      [LOSER, BetStatus.LOST],
      [UNCONFIRMED, BetStatus.CANCELLED],
    ]);
  });

  test('should commit RoundCrashed and BetCancelled events', async () => {
    // Act
    await useCase.execute({ round: liveRound });

    // Assert
    const events = unitOfWork.committedEvents;
    expect(events.map((e) => e.eventType).sort()).toEqual(['BetCancelled', 'RoundCrashed']);

    const crashed = events.find((e) => e.eventType === 'RoundCrashed') as RoundCrashedEvent;
    const winnerBet = dbRound.getBetByPlayer(WINNER)!;
    expect(crashed.crashPoint).toBe(dbRound.getCrashPoint()!);
    expect(crashed.seed).toBe(dbRound.getSeed());
    expect(crashed.totalBets).toBe(2);
    expect(crashed.totalBetAmount).toBe(3000n);
    expect(crashed.totalWinAmount).toBe(winnerBet.getProfitCents());
  });

  test('should not settle bets that were already cashed out', async () => {
    // Act
    await useCase.execute({ round: liveRound });

    // Assert
    const updatedPlayers = betRepository.update.calls.map(([bet]) => (bet as Bet).playerId);
    expect(updatedPlayers).not.toContain(WINNER);
    expect(dbRound.getBetByPlayer(WINNER)!.getStatus()).toBe(BetStatus.CASHED_OUT);
  });

  test('should broadcast the crash with the revealed seed', async () => {
    // Act
    await useCase.execute({ round: liveRound });

    // Assert
    expect(broadcaster.broadcastCrash.calls).toEqual([
      [
        {
          roundId: dbRound.id,
          crashPoint: dbRound.getCrashPoint()!,
          seed: dbRound.getSeed(),
        },
      ],
    ]);
  });

  test('should record crash, duration, settled bet and RTP metrics', async () => {
    // Act
    await useCase.execute({ round: liveRound });

    // Assert
    expect(metrics.observeCrashPoint.calls).toEqual([[dbRound.getCrashPoint()!]]);
    expect(metrics.observeRoundDuration.callCount).toBe(1);
    expect(metrics.observeRoundDuration.calls[0]![0]).toBeGreaterThanOrEqual(0);
    expect(metrics.incrBet.calls).toEqual([
      ['lost', 1000],
      ['cancelled', 3000],
    ]);

    const payoutCents = dbRound.getBetByPlayer(WINNER)!.getCashOutAmount()!.toCents();
    const expectedRtp = Number((payoutCents * 10_000n) / 3000n) / 100;
    expect(metrics.setRtp.calls).toEqual([[expectedRtp]]);
  });

  test('should not record RTP for a round without wagers', async () => {
    // Arrange
    const emptyRound = await Round.create(undefined, 'test-crash-10.0');
    await emptyRound.startRound();
    const emptyDbRound = persistedCopyOf(emptyRound);
    roundRepository.findById.mockResolvedValue(emptyDbRound);

    // Act
    await useCase.execute({ round: emptyRound });

    // Assert
    expect(betRepository.update.callCount).toBe(0);
    expect(unitOfWork.committedEvents.map((e) => e.eventType)).toEqual(['RoundCrashed']);
    expect(metrics.observeCrashPoint.callCount).toBe(1);
    expect(metrics.incrBet.callCount).toBe(0);
    expect(metrics.setRtp.callCount).toBe(0);
  });

  test('should skip when the database round is not ACTIVE', async () => {
    // Arrange
    dbRound.crash();
    dbRound.pullEvents();

    // Act
    const result = await useCase.execute({ round: liveRound });

    // Assert
    expect(result.round).toBe(dbRound);
    expect(unitOfWork.commit.callCount).toBe(0);
    expect(roundRepository.save.callCount).toBe(0);
    expect(betRepository.update.callCount).toBe(0);
    expect(broadcaster.broadcastCrash.callCount).toBe(0);
    expect(metrics.observeCrashPoint.callCount).toBe(0);
  });

  test('should skip when the database round is still BETTING', async () => {
    // Arrange
    const bettingRound = await Round.create(undefined, 'test-crash-10.0');
    roundRepository.findById.mockResolvedValue(Round.restore(bettingRound.toPersistence(), []));

    // Act
    const result = await useCase.execute({ round: bettingRound });

    // Assert
    expect(result.round.getStatus()).toBe(RoundStatus.BETTING);
    expect(unitOfWork.commit.callCount).toBe(0);
    expect(broadcaster.broadcastCrash.callCount).toBe(0);
  });

  test('should throw RoundNotFoundError when the round is not in the database', async () => {
    // Arrange
    roundRepository.findById.mockResolvedValue(null);

    // Act & Assert
    await expect(useCase.execute({ round: liveRound })).rejects.toThrow(RoundNotFoundError);
    expect(unitOfWork.commit.callCount).toBe(0);
    expect(broadcaster.broadcastCrash.callCount).toBe(0);
  });

  test('should not broadcast or record metrics when the commit fails', async () => {
    // Arrange
    roundRepository.save.mockRejectedValue(new Error('db down'));

    // Act & Assert
    await expect(useCase.execute({ round: liveRound })).rejects.toThrow('db down');
    expect(unitOfWork.commits).toHaveLength(0);
    expect(broadcaster.broadcastCrash.callCount).toBe(0);
    expect(metrics.observeCrashPoint.callCount).toBe(0);
  });
});
