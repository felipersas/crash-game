import { describe, test, expect, beforeEach } from 'bun:test';
import { BetId, Money, PlayerId, RoundId } from '@crash/domain';
import { ConfirmBetUseCase } from '../../../src/application/use-cases/confirm-bet.use-case';
import { Bet, BetStatus, type BetSnapshot } from '../../../src/domain/entities/bet.entity';
import { Round } from '../../../src/domain/entities/round.entity';
import { BetNotFoundError, InvalidBetStateError } from '../../../src/domain/errors/domain.errors';
import {
  FAKE_TX,
  createMockAutoCashOutRepository,
  createMockBetRepository,
  createMockBroadcaster,
  createMockMetrics,
  createMockRoundStateProvider,
  createMockUnitOfWork,
} from '../../helpers/mocks';

const PLAYER_ID = PlayerId.from('player-123');
const PLAYER_NAME = 'Player 123';
const ROUND_ID = RoundId.from('round-1');

function restoreBet(overrides: Partial<BetSnapshot> = {}): Bet {
  return Bet.restore({
    id: BetId.create(),
    roundId: ROUND_ID,
    playerId: PLAYER_ID,
    playerName: PLAYER_NAME,
    amountCents: 1000n,
    status: BetStatus.PENDING,
    autoCashOutMultiplier: null,
    cashOutMultiplier: null,
    cashOutAmount: null,
    cashedOutAt: null,
    cancelReason: null,
    createdAt: new Date(),
    ...overrides,
  });
}

describe('ConfirmBetUseCase', () => {
  let betRepository: ReturnType<typeof createMockBetRepository>;
  let roundStateProvider: ReturnType<typeof createMockRoundStateProvider>;
  let autoCashOutRepository: ReturnType<typeof createMockAutoCashOutRepository>;
  let unitOfWork: ReturnType<typeof createMockUnitOfWork>;
  let broadcaster: ReturnType<typeof createMockBroadcaster>;
  let metrics: ReturnType<typeof createMockMetrics>;
  let useCase: ConfirmBetUseCase;

  beforeEach(() => {
    betRepository = createMockBetRepository();
    roundStateProvider = createMockRoundStateProvider();
    autoCashOutRepository = createMockAutoCashOutRepository();
    unitOfWork = createMockUnitOfWork();
    broadcaster = createMockBroadcaster();
    metrics = createMockMetrics();
    useCase = new ConfirmBetUseCase(
      betRepository as never,
      roundStateProvider as never,
      autoCashOutRepository as never,
      unitOfWork as never,
      broadcaster as never,
      metrics as never,
    );
  });

  describe('Happy path', () => {
    test('should confirm a pending bet (PENDING -> ACTIVE)', async () => {
      // Arrange
      const bet = restoreBet();
      betRepository.findById.mockResolvedValue(bet);

      // Act
      const result = await useCase.execute({
        roundId: ROUND_ID,
        betId: bet.id,
        playerId: PLAYER_ID,
      });

      // Assert
      expect(result).toEqual({ betId: bet.id, roundId: ROUND_ID, playerId: PLAYER_ID });
      expect(bet.getStatus()).toBe(BetStatus.ACTIVE);
      expect(betRepository.findById.calls).toEqual([[bet.id]]);
    });

    test('should persist the bet and commit BetConfirmed in the unit of work', async () => {
      // Arrange
      const bet = restoreBet();
      betRepository.findById.mockResolvedValue(bet);

      // Act
      await useCase.execute({ roundId: ROUND_ID, betId: bet.id, playerId: PLAYER_ID });

      // Assert
      expect(betRepository.update.calls).toEqual([[bet, FAKE_TX]]);
      expect(unitOfWork.commits).toHaveLength(1);
      expect(unitOfWork.commits[0].aggregateId).toBe(ROUND_ID);
      const events = unitOfWork.committedEvents;
      expect(events.map((e) => e.eventType)).toEqual(['BetConfirmed']);
      expect(events[0]).toMatchObject({ betId: bet.id, playerId: PLAYER_ID, amount: 1000n });
    });

    test('should broadcast the confirmation and record metrics', async () => {
      // Arrange
      const bet = restoreBet();
      betRepository.findById.mockResolvedValue(bet);

      // Act
      await useCase.execute({ roundId: ROUND_ID, betId: bet.id, playerId: PLAYER_ID });

      // Assert
      expect(broadcaster.broadcastBetConfirmed.calls[0][0]).toEqual({
        roundId: ROUND_ID,
        betId: bet.id,
        playerId: PLAYER_ID,
        playerName: PLAYER_NAME,
        amountCents: 1000n,
      });
      expect(metrics.incrBet.calls).toEqual([['confirmed', 1000]]);
    });
  });

  describe('Bet ownership', () => {
    test('should throw BetNotFoundError when the bet does not exist', async () => {
      // Arrange
      betRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        useCase.execute({ roundId: ROUND_ID, betId: BetId.create(), playerId: PLAYER_ID }),
      ).rejects.toThrow(BetNotFoundError);
      expect(unitOfWork.commit.callCount).toBe(0);
    });

    test('should throw BetNotFoundError when the bet belongs to another player', async () => {
      // Arrange
      const bet = restoreBet({ playerId: PlayerId.from('someone-else') });
      betRepository.findById.mockResolvedValue(bet);

      // Act & Assert
      await expect(
        useCase.execute({ roundId: ROUND_ID, betId: bet.id, playerId: PLAYER_ID }),
      ).rejects.toThrow(BetNotFoundError);
      expect(bet.getStatus()).toBe(BetStatus.PENDING);
      expect(unitOfWork.commit.callCount).toBe(0);
    });

    test('should throw BetNotFoundError when the bet belongs to another round', async () => {
      // Arrange
      const bet = restoreBet({ roundId: RoundId.from('other-round') });
      betRepository.findById.mockResolvedValue(bet);

      // Act & Assert
      await expect(
        useCase.execute({ roundId: ROUND_ID, betId: bet.id, playerId: PLAYER_ID }),
      ).rejects.toThrow(BetNotFoundError);
      expect(unitOfWork.commit.callCount).toBe(0);
    });

    test('should not confirm the newer bet when the reply refers to an old replaced bet (regression)', async () => {
      // Arrange: the old bet was replaced (CANCELLED); a newer PENDING bet exists
      const oldBet = restoreBet({
        status: BetStatus.CANCELLED,
        cancelReason: 'Replaced by new bet attempt',
      });
      const newerBet = restoreBet();
      betRepository.findById.mockImplementation(async (id: string) =>
        id === oldBet.id ? oldBet : id === newerBet.id ? newerBet : null,
      );
      betRepository.findByPlayerAndRound.mockResolvedValue(newerBet);

      // Act & Assert
      await expect(
        useCase.execute({ roundId: ROUND_ID, betId: oldBet.id, playerId: PLAYER_ID }),
      ).rejects.toThrow(InvalidBetStateError);
      expect(newerBet.getStatus()).toBe(BetStatus.PENDING);
      expect(betRepository.findByPlayerAndRound.callCount).toBe(0);
      expect(unitOfWork.commit.callCount).toBe(0);
      expect(broadcaster.broadcastBetConfirmed.callCount).toBe(0);
    });

    test('should throw InvalidBetStateError when the bet is not PENDING', async () => {
      // Arrange
      const bet = restoreBet({ status: BetStatus.ACTIVE });
      betRepository.findById.mockResolvedValue(bet);

      // Act & Assert
      await expect(
        useCase.execute({ roundId: ROUND_ID, betId: bet.id, playerId: PLAYER_ID }),
      ).rejects.toThrow(InvalidBetStateError);
      expect(unitOfWork.commit.callCount).toBe(0);
      expect(autoCashOutRepository.addTarget.callCount).toBe(0);
    });
  });

  describe('Live round sync', () => {
    test('should sync the confirmed bet into the live round when round ids match', async () => {
      // Arrange
      const liveRound = await Round.create();
      const staleLiveBet = liveRound.placeBet(PLAYER_ID, PLAYER_NAME, Money.fromDecimal('10.00'));
      liveRound.pullEvents();
      const bet = restoreBet({ id: staleLiveBet.id, roundId: liveRound.id });
      betRepository.findById.mockResolvedValue(bet);
      roundStateProvider.getCurrentRound.mockReturnValue(liveRound);

      // Act
      await useCase.execute({ roundId: liveRound.id, betId: bet.id, playerId: PLAYER_ID });

      // Assert
      expect(liveRound.getBetByPlayer(PLAYER_ID)).toBe(bet);
      expect(liveRound.getBetByPlayer(PLAYER_ID)?.isActive()).toBe(true);
    });

    test('should not touch the live round when it is a different round', async () => {
      // Arrange
      const liveRound = await Round.create();
      liveRound.pullEvents();
      const bet = restoreBet();
      betRepository.findById.mockResolvedValue(bet);
      roundStateProvider.getCurrentRound.mockReturnValue(liveRound);

      // Act
      await useCase.execute({ roundId: ROUND_ID, betId: bet.id, playerId: PLAYER_ID });

      // Assert
      expect(liveRound.getBetByPlayer(PLAYER_ID)).toBeUndefined();
      expect(bet.getStatus()).toBe(BetStatus.ACTIVE);
    });

    test('should confirm the bet when there is no live round', async () => {
      // Arrange
      const bet = restoreBet();
      betRepository.findById.mockResolvedValue(bet);
      roundStateProvider.getCurrentRound.mockReturnValue(null);

      // Act
      await useCase.execute({ roundId: ROUND_ID, betId: bet.id, playerId: PLAYER_ID });

      // Assert
      expect(bet.getStatus()).toBe(BetStatus.ACTIVE);
      expect(unitOfWork.commit.callCount).toBe(1);
    });
  });

  describe('Auto cash-out', () => {
    test('should register the auto cash-out target after the commit', async () => {
      // Arrange
      const bet = restoreBet({ autoCashOutMultiplier: 2.5 });
      betRepository.findById.mockResolvedValue(bet);
      let commitsAtRegistration = -1;
      autoCashOutRepository.addTarget.mockImplementation(async () => {
        commitsAtRegistration = unitOfWork.commits.length;
      });

      // Act
      await useCase.execute({ roundId: ROUND_ID, betId: bet.id, playerId: PLAYER_ID });

      // Assert
      expect(autoCashOutRepository.addTarget.calls).toEqual([[ROUND_ID, PLAYER_ID, 2.5]]);
      expect(commitsAtRegistration).toBe(1);
    });

    test('should not register an auto cash-out target when the bet has none', async () => {
      // Arrange
      const bet = restoreBet();
      betRepository.findById.mockResolvedValue(bet);

      // Act
      await useCase.execute({ roundId: ROUND_ID, betId: bet.id, playerId: PLAYER_ID });

      // Assert
      expect(autoCashOutRepository.addTarget.callCount).toBe(0);
    });

    test('should not register the target when the commit fails', async () => {
      // Arrange
      const bet = restoreBet({ autoCashOutMultiplier: 2.5 });
      betRepository.findById.mockResolvedValue(bet);
      unitOfWork.commit.mockRejectedValue(new Error('db down'));

      // Act & Assert
      await expect(
        useCase.execute({ roundId: ROUND_ID, betId: bet.id, playerId: PLAYER_ID }),
      ).rejects.toThrow('db down');
      expect(autoCashOutRepository.addTarget.callCount).toBe(0);
      expect(broadcaster.broadcastBetConfirmed.callCount).toBe(0);
    });

    test('should log and continue when registering the auto cash-out target fails', async () => {
      // Arrange
      const bet = restoreBet({ autoCashOutMultiplier: 2.5 });
      betRepository.findById.mockResolvedValue(bet);
      autoCashOutRepository.addTarget.mockRejectedValue(new Error('redis down'));

      // Act
      const result = await useCase.execute({
        roundId: ROUND_ID,
        betId: bet.id,
        playerId: PLAYER_ID,
      });

      // Assert
      expect(result.betId).toBe(bet.id);
      expect(unitOfWork.commit.callCount).toBe(1);
      expect(broadcaster.broadcastBetConfirmed.callCount).toBe(1);
    });
  });
});
