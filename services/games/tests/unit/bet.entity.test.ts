/**
 * Unit tests for Bet Entity.
 *
 * Tests cover:
 * - Bet creation and auto cash-out bounds
 * - Restoration from a snapshot
 * - Saga transitions (confirm / cancel) and their domain events
 * - Cash out, mark as lost, profit
 * - Persistence
 */

import { describe, test, expect } from 'bun:test';
import { Bet, BetStatus, type BetSnapshot } from '../../src/domain/entities/bet.entity';
import {
  InvalidAutoCashOutMultiplierError,
  InvalidBetStateError,
} from '../../src/domain/errors/domain.errors';
import { Money, RoundId, PlayerId, BetId } from '@crash/domain';
import { Multiplier } from '../../src/domain/value-objects/multiplier.value-object';

describe('Bet Entity', () => {
  const roundId = RoundId.from('round-123');
  const playerId = PlayerId.from('player-456');
  const playerName = 'Player 456';

  function createBet(amount = Money.fromDecimal('10.00'), autoCashOut?: number): Bet {
    return Bet.create(roundId, playerId, playerName, amount, autoCashOut);
  }

  function createActiveBet(amount = Money.fromDecimal('10.00')): Bet {
    const bet = createBet(amount);
    bet.confirm();
    bet.pullEvents();
    return bet;
  }

  function snapshot(overrides: Partial<BetSnapshot> = {}): BetSnapshot {
    return {
      id: BetId.from('bet-1'),
      roundId,
      playerId,
      playerName,
      amountCents: 1000n,
      status: BetStatus.ACTIVE,
      autoCashOutMultiplier: null,
      cashOutMultiplier: null,
      cashOutAmount: null,
      cashedOutAt: null,
      cancelReason: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    };
  }

  describe('Creation', () => {
    test('should create PENDING bet with valid parameters', () => {
      const bet = createBet();

      expect(bet.id).toBeDefined();
      expect(bet.roundId).toBe(roundId);
      expect(bet.playerId).toBe(playerId);
      expect(bet.playerName).toBe(playerName);
      expect(bet.getAmount().toCents()).toBe(1000n);
      expect(bet.getStatus()).toBe(BetStatus.PENDING);
      expect(bet.getCashOutMultiplier()).toBeNull();
      expect(bet.getCashOutAmount()).toBeNull();
      expect(bet.getCashedOutAt()).toBeNull();
      expect(bet.getCancelReason()).toBeNull();
      expect(bet.getCreatedAt()).toBeInstanceOf(Date);
    });

    test('should generate unique bet IDs', () => {
      expect(createBet().id).not.toBe(createBet().id);
    });

    test('should not raise events on creation', () => {
      expect(createBet().pullEvents()).toHaveLength(0);
    });
  });

  describe('Restoration from snapshot', () => {
    test('should round-trip a cashed out bet through toPersistence/restore', () => {
      const bet = createActiveBet();
      bet.cashOut(Multiplier.fromValue(2.5));

      const restored = Bet.restore(bet.toPersistence());

      expect(restored.id).toBe(bet.id);
      expect(restored.roundId).toBe(roundId);
      expect(restored.playerId).toBe(playerId);
      expect(restored.playerName).toBe(playerName);
      expect(restored.getStatus()).toBe(BetStatus.CASHED_OUT);
      expect(restored.getCashOutMultiplier()?.getValue()).toBe(2.5);
      expect(restored.getCashOutAmount()?.toCents()).toBe(2500n);
      expect(restored.getCashedOutAt()).toEqual(bet.getCashedOutAt());
      expect(restored.getCreatedAt()).toEqual(bet.getCreatedAt());
    });

    test('should restore lost bet', () => {
      const bet = createActiveBet();
      bet.markAsLost();

      expect(Bet.restore(bet.toPersistence()).getStatus()).toBe(BetStatus.LOST);
    });

    test('should restore cancelReason and createdAt', () => {
      const createdAt = new Date('2026-02-03T04:05:06Z');
      const restored = Bet.restore(
        snapshot({ status: BetStatus.CANCELLED, cancelReason: 'Insufficient funds', createdAt }),
      );

      expect(restored.isCancelled()).toBe(true);
      expect(restored.getCancelReason()).toBe('Insufficient funds');
      expect(restored.getCreatedAt()).toEqual(createdAt);
      expect(restored.createdAt).toEqual(createdAt);
    });

    test('should restore autoCashOutMultiplier', () => {
      const restored = Bet.restore(snapshot({ autoCashOutMultiplier: 2.5 }));

      expect(restored.getAutoCashOutMultiplier()).toBe(2.5);
      expect(restored.hasAutoCashOut()).toBe(true);
    });

    test('should not raise events on restore', () => {
      expect(Bet.restore(snapshot()).pullEvents()).toHaveLength(0);
    });
  });

  describe('Confirm', () => {
    test('should transition PENDING bet to ACTIVE', () => {
      const bet = createBet();

      bet.confirm();

      expect(bet.getStatus()).toBe(BetStatus.ACTIVE);
    });

    test('should record BetConfirmed event', () => {
      const bet = createBet();

      bet.confirm();

      const events = bet.pullEvents();
      expect(events).toHaveLength(1);
      const event = events[0];
      if (event.eventType !== 'BetConfirmed') throw new Error('Expected BetConfirmed event');
      expect(event.aggregateId).toBe(roundId);
      expect(event.roundId).toBe(roundId);
      expect(event.betId).toBe(bet.id);
      expect(event.playerId).toBe(playerId);
      expect(event.amount).toBe(1000n);
    });

    test('should drain events on pullEvents', () => {
      const bet = createBet();
      bet.confirm();

      bet.pullEvents();

      expect(bet.pullEvents()).toHaveLength(0);
    });

    test('should reject confirming a non-PENDING bet', () => {
      const bet = createActiveBet();

      expect(() => bet.confirm()).toThrow(InvalidBetStateError);
      expect(() => bet.confirm()).toThrow('Cannot confirm a bet in ACTIVE state');
    });

    test('should reject confirming a cancelled bet', () => {
      const bet = createBet();
      bet.cancel('test');

      expect(() => bet.confirm()).toThrow(InvalidBetStateError);
    });
  });

  describe('Cancel', () => {
    test('should transition PENDING bet to CANCELLED and keep the reason', () => {
      const bet = createBet();

      bet.cancel('Insufficient funds');

      expect(bet.getStatus()).toBe(BetStatus.CANCELLED);
      expect(bet.getCancelReason()).toBe('Insufficient funds');
      expect(bet.toPersistence().cancelReason).toBe('Insufficient funds');
    });

    test('should record BetCancelled event with the reason', () => {
      const bet = createBet();

      bet.cancel('Insufficient funds');

      const events = bet.pullEvents();
      expect(events).toHaveLength(1);
      const event = events[0];
      if (event.eventType !== 'BetCancelled') throw new Error('Expected BetCancelled event');
      expect(event.aggregateId).toBe(roundId);
      expect(event.betId).toBe(bet.id);
      expect(event.playerId).toBe(playerId);
      expect(event.amount).toBe(1000n);
      expect(event.reason).toBe('Insufficient funds');
    });

    test('should reject cancelling an ACTIVE bet', () => {
      const bet = createActiveBet();

      expect(() => bet.cancel('test')).toThrow(InvalidBetStateError);
      expect(bet.pullEvents()).toHaveLength(0);
    });

    test('should reject cancelling an already cancelled bet', () => {
      const bet = createBet();
      bet.cancel('first');

      expect(() => bet.cancel('second')).toThrow(InvalidBetStateError);
      expect(bet.getCancelReason()).toBe('first');
    });
  });

  describe('Cash Out', () => {
    test('should cash out active bet and calculate payout correctly', () => {
      const bet = createActiveBet();

      const payout = bet.cashOut(Multiplier.fromValue(2.5));

      expect(payout.toCents()).toBe(2500n);
      expect(bet.getStatus()).toBe(BetStatus.CASHED_OUT);
      expect(bet.getCashOutMultiplier()?.getValue()).toBe(2.5);
      expect(bet.getCashOutAmount()?.toCents()).toBe(2500n);
      expect(bet.getCashedOutAt()).toBeInstanceOf(Date);
    });

    test('should cash out at 1.00x', () => {
      expect(createActiveBet().cashOut(Multiplier.fromValue(1.0)).toCents()).toBe(1000n);
    });

    test('should cash out at high multiplier', () => {
      expect(createActiveBet().cashOut(Multiplier.fromValue(100)).toCents()).toBe(100000n);
    });

    test('should truncate the multiplier to hundredths (2.01x pays 20.10)', () => {
      expect(createActiveBet().cashOut(Multiplier.fromValue(2.01)).toCents()).toBe(2010n);
    });

    test('should not raise bet events on cash out', () => {
      const bet = createActiveBet();

      bet.cashOut(Multiplier.fromValue(2.0));

      expect(bet.pullEvents()).toHaveLength(0);
    });

    test('should reject cash out for pending bet', () => {
      expect(() => createBet().cashOut(Multiplier.fromValue(2.5))).toThrow(
        'Cannot cash out a bet in PENDING state',
      );
    });

    test('should reject cash out for already cashed out bet', () => {
      const bet = createActiveBet();
      bet.cashOut(Multiplier.fromValue(2.5));

      expect(() => bet.cashOut(Multiplier.fromValue(3.0))).toThrow(
        'Cannot cash out a bet in CASHED_OUT state',
      );
    });

    test('should reject cash out for lost bet', () => {
      const bet = createActiveBet();
      bet.markAsLost();

      expect(() => bet.cashOut(Multiplier.fromValue(2.5))).toThrow(InvalidBetStateError);
    });
  });

  describe('Mark as Lost', () => {
    test('should mark active bet as lost', () => {
      const bet = createActiveBet();

      bet.markAsLost();

      expect(bet.getStatus()).toBe(BetStatus.LOST);
      expect(bet.getCashOutAmount()).toBeNull();
    });

    test('should reject marking a PENDING bet as lost (it must be cancelled instead)', () => {
      const bet = createBet();

      expect(() => bet.markAsLost()).toThrow(InvalidBetStateError);
      expect(() => bet.markAsLost()).toThrow('Cannot mark as lost a bet in PENDING state');
      expect(bet.getStatus()).toBe(BetStatus.PENDING);
    });

    test('should reject marking a cancelled bet as lost', () => {
      const bet = createBet();
      bet.cancel('test');

      expect(() => bet.markAsLost()).toThrow(InvalidBetStateError);
    });

    test('should reject marking cashed out bet as lost', () => {
      const bet = createActiveBet();
      bet.cashOut(Multiplier.fromValue(2.5));

      expect(() => bet.markAsLost()).toThrow('Cannot mark as lost a bet in CASHED_OUT state');
    });

    test('should reject marking already lost bet', () => {
      const bet = createActiveBet();
      bet.markAsLost();

      expect(() => bet.markAsLost()).toThrow('Cannot mark as lost a bet in LOST state');
    });
  });

  describe('Profit', () => {
    test('should be payout minus stake when cashed out', () => {
      const bet = createActiveBet();
      bet.cashOut(Multiplier.fromValue(2.5));

      expect(bet.getProfitCents()).toBe(1500n);
    });

    test('should be zero when cashed out at 1.00x', () => {
      const bet = createActiveBet();
      bet.cashOut(Multiplier.fromValue(1.0));

      expect(bet.getProfitCents()).toBe(0n);
    });

    test('should be minus the stake when lost', () => {
      const bet = createActiveBet();
      bet.markAsLost();

      expect(bet.getProfitCents()).toBe(-1000n);
    });

    test('should be zero for PENDING, ACTIVE and CANCELLED bets', () => {
      const cancelled = createBet();
      cancelled.cancel('test');

      expect(createBet().getProfitCents()).toBe(0n);
      expect(createActiveBet().getProfitCents()).toBe(0n);
      expect(cancelled.getProfitCents()).toBe(0n);
    });

    test('should be computed from restored state', () => {
      const restored = Bet.restore(
        snapshot({
          status: BetStatus.CASHED_OUT,
          cashOutMultiplier: 3,
          cashOutAmount: 3000n,
          cashedOutAt: new Date(),
        }),
      );

      expect(restored.getProfitCents()).toBe(2000n);
    });
  });

  describe('State Checks', () => {
    test('should correctly identify pending bet', () => {
      const bet = createBet();

      expect(bet.isPending()).toBe(true);
      expect(bet.isActive()).toBe(false);
      expect(bet.isCashedOut()).toBe(false);
      expect(bet.isLost()).toBe(false);
      expect(bet.isCancelled()).toBe(false);
    });

    test('should correctly identify confirmed (active) bet', () => {
      const bet = createActiveBet();

      expect(bet.isPending()).toBe(false);
      expect(bet.isActive()).toBe(true);
      expect(bet.isCashedOut()).toBe(false);
      expect(bet.isLost()).toBe(false);
    });

    test('should correctly identify cashed out bet', () => {
      const bet = createActiveBet();
      bet.cashOut(Multiplier.fromValue(2.5));

      expect(bet.isActive()).toBe(false);
      expect(bet.isCashedOut()).toBe(true);
      expect(bet.isLost()).toBe(false);
    });

    test('should correctly identify lost bet', () => {
      const bet = createActiveBet();
      bet.markAsLost();

      expect(bet.isActive()).toBe(false);
      expect(bet.isCashedOut()).toBe(false);
      expect(bet.isLost()).toBe(true);
    });

    test('should correctly identify cancelled bet', () => {
      const bet = createBet();
      bet.cancel('Insufficient funds');

      expect(bet.isPending()).toBe(false);
      expect(bet.isCancelled()).toBe(true);
      expect(bet.isActive()).toBe(false);
    });
  });

  describe('Persistence', () => {
    test('should convert pending bet to snapshot', () => {
      const bet = createBet();

      const data = bet.toPersistence();

      expect(data).toEqual({
        id: bet.id,
        roundId,
        playerId,
        playerName,
        amountCents: 1000n,
        status: BetStatus.PENDING,
        autoCashOutMultiplier: null,
        cashOutMultiplier: null,
        cashOutAmount: null,
        cashedOutAt: null,
        cancelReason: null,
        createdAt: bet.getCreatedAt(),
      });
    });

    test('should convert cashed out bet to snapshot', () => {
      const bet = createActiveBet();
      bet.cashOut(Multiplier.fromValue(2.5));

      const data = bet.toPersistence();

      expect(data.status).toBe(BetStatus.CASHED_OUT);
      expect(data.cashOutMultiplier).toBe(2.5);
      expect(data.cashOutAmount).toBe(2500n);
      expect(data.cashedOutAt).toBeInstanceOf(Date);
    });

    test('should convert lost bet to snapshot', () => {
      const bet = createActiveBet();
      bet.markAsLost();

      const data = bet.toPersistence();

      expect(data.status).toBe(BetStatus.LOST);
      expect(data.cashOutMultiplier).toBeNull();
      expect(data.cashOutAmount).toBeNull();
    });
  });

  describe('Auto cash-out multiplier', () => {
    test('should expose the configured bounds', () => {
      expect(Bet.MIN_AUTO_CASHOUT_MULTIPLIER).toBe(1.01);
      expect(Bet.MAX_AUTO_CASHOUT_MULTIPLIER).toBe(1000);
    });

    test('should create bet with autoCashOutMultiplier', () => {
      const bet = createBet(Money.fromCents(1000n), 2.5);

      expect(bet.getAutoCashOutMultiplier()).toBe(2.5);
      expect(bet.hasAutoCashOut()).toBe(true);
    });

    test('should create bet without autoCashOutMultiplier', () => {
      const bet = createBet(Money.fromCents(1000n));

      expect(bet.getAutoCashOutMultiplier()).toBeNull();
      expect(bet.hasAutoCashOut()).toBe(false);
    });

    test('should accept the exact bounds', () => {
      expect(
        createBet(
          Money.fromCents(1000n),
          Bet.MIN_AUTO_CASHOUT_MULTIPLIER,
        ).getAutoCashOutMultiplier(),
      ).toBe(Bet.MIN_AUTO_CASHOUT_MULTIPLIER);
      expect(
        createBet(
          Money.fromCents(1000n),
          Bet.MAX_AUTO_CASHOUT_MULTIPLIER,
        ).getAutoCashOutMultiplier(),
      ).toBe(Bet.MAX_AUTO_CASHOUT_MULTIPLIER);
    });

    test('should reject autoCashOutMultiplier below the minimum', () => {
      expect(() => createBet(Money.fromCents(1000n), 1.0)).toThrow(
        InvalidAutoCashOutMultiplierError,
      );
    });

    test('should reject autoCashOutMultiplier above the maximum', () => {
      expect(() => createBet(Money.fromCents(1000n), 1001)).toThrow(
        InvalidAutoCashOutMultiplierError,
      );
    });

    test('should include autoCashOutMultiplier in snapshot', () => {
      expect(createBet(Money.fromCents(1000n), 3.0).toPersistence().autoCashOutMultiplier).toBe(
        3.0,
      );
      expect(createBet(Money.fromCents(1000n)).toPersistence().autoCashOutMultiplier).toBeNull();
    });
  });
});
