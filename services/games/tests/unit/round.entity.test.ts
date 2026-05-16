/**
 * Unit tests for Round Entity (Aggregate Root).
 *
 * Tests cover:
 * - Round creation
 * - Round lifecycle (BETTING → ACTIVE → CRASHED)
 * - Bet placement
 * - Cash out
 * - Crash logic
 * - Domain events
 * - Persistence
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { Round, RoundStatus, DEFAULT_ROUND_CONFIG } from '../../src/domain/entities/round.entity';
import { Bet } from '../../src/domain/entities/bet.entity';
import { Multiplier } from '../../src/domain/value-objects/multiplier.value-object';
import { Money, PlayerId } from '@crash/domain';
import {
  RoundNotAcceptingBetsError,
  DuplicateBetError,
  NoActiveBetError,
  RoundAlreadyCrashedError,
  BetBelowMinimumError,
  BetAboveMaximumError,
} from '../../src/domain/errors/domain.errors';

describe('Round Entity', () => {
  let round: Round;

  beforeEach(async () => {
    round = await Round.create();
  });

  describe('Creation', () => {
    test('should create round with BETTING status', async () => {
      const newRound = await Round.create();

      expect(newRound.id).toBeDefined();
      expect(newRound.getStatus()).toBe(RoundStatus.BETTING);
      expect(newRound.getCrashPoint()).toBeNull();
      expect(newRound.getBettingEndTime()).toBeInstanceOf(Date);
      expect(newRound.getStartedAt()).toBeNull();
      expect(newRound.getCrashedAt()).toBeNull();
    });

    test('should generate unique round IDs', async () => {
      const round1 = await Round.create();
      const round2 = await Round.create();

      expect(round1.id).not.toBe(round2.id);
    });

    test('should emit RoundStartedEvent on creation', async () => {
      const newRound = await Round.create();
      const events = newRound.pullEvents();

      expect(events).toHaveLength(1);
      const event = events[0];
      if (event.eventType === 'RoundStarted') {
        expect(event.roundId).toBe(newRound.id);
      } else {
        throw new Error('Expected RoundStarted event');
      }
    });

    test('should have seed hash committed before round starts', async () => {
      const newRound = await Round.create();
      const events = newRound.pullEvents();

      const event = events[0];
      if (event.eventType === 'RoundStarted') {
        expect(event.seedHash).toBeDefined();
        expect(event.seedHash).toHaveLength(64);
      } else {
        throw new Error('Expected RoundStarted event');
      }
    });

    test('should start with multiplier at 1.00x', async () => {
      const newRound = await Round.create();

      expect(newRound.getCurrentMultiplier()).toBe(1.0);
    });
  });

  describe('Bet Placement', () => {
    test('should place bet during BETTING phase', () => {
      const playerId = PlayerId.from('player-1');
      const amount = Money.fromDecimal('10.00');

      round.placeBet(playerId, 'Player One', amount);

      const bet = round.getBetByPlayer(playerId);
      expect(bet).toBeDefined();
      expect(bet?.getAmount().toCents()).toBe(1000n);
      expect(bet?.getStatus()).toBe('PENDING');
    });

    test('should emit BetPlacedEvent when bet is placed', () => {
      const playerId = PlayerId.from('player-1');
      const amount = Money.fromDecimal('10.00');

      round.pullEvents();

      round.placeBet(playerId, 'Player One', amount);

      const events = round.pullEvents();
      expect(events).toHaveLength(1);
      const event = events[0];
      if (event.eventType === 'BetPlaced') {
        expect(event.playerId).toBe(playerId);
      } else {
        throw new Error('Expected BetPlaced event');
      }
    });

    test('should reject bet when not in BETTING phase', async () => {
      const playerId = PlayerId.from('player-1');
      const amount = Money.fromDecimal('10.00');

      await round.startRound();

      expect(() => round.placeBet(playerId, 'Player One', amount)).toThrow(
        RoundNotAcceptingBetsError,
      );
    });

    test('should reject duplicate bet from same player', () => {
      const playerId = PlayerId.from('player-1');
      const amount = Money.fromDecimal('10.00');

      round.placeBet(playerId, 'Player One', amount);

      expect(() => round.placeBet(playerId, 'Player One', amount)).toThrow(DuplicateBetError);
    });

    test('should reject bet below minimum', () => {
      const playerId = PlayerId.from('player-1');
      const amount = Money.fromDecimal('0.50');

      expect(() => round.placeBet(playerId, 'Player One', amount)).toThrow(BetBelowMinimumError);
    });

    test('should reject bet above maximum', () => {
      const playerId = PlayerId.from('player-1');
      const amount = Money.fromDecimal('2000.00');

      expect(() => round.placeBet(playerId, 'Player One', amount)).toThrow(BetAboveMaximumError);
    });

    test('should accept minimum bet amount', () => {
      const playerId = PlayerId.from('player-1');
      const amount = Money.fromDecimal('1.00');

      expect(() => round.placeBet(playerId, 'Player One', amount)).not.toThrow();
    });

    test('should accept maximum bet amount', () => {
      const playerId = PlayerId.from('player-1');
      const amount = Money.fromDecimal('1000.00');

      expect(() => round.placeBet(playerId, 'Player One', amount)).not.toThrow();
    });

    test('should NOT increment version when bet is placed (bet is separate entity)', () => {
      const playerId = PlayerId.from('player-1');
      const amount = Money.fromDecimal('10.00');
      const initialVersion = round.getVersion();

      round.placeBet(playerId, 'Player One', amount);

      expect(round.getVersion()).toBe(initialVersion);
    });
  });

  describe('placeOrReplaceBet', () => {
    const playerId = PlayerId.from('player-1');
    const amount = Money.fromDecimal('10.00');

    test('should place bet when no existing bet', () => {
      const { bet, replacedBet } = round.placeOrReplaceBet(playerId, 'Player One', amount);

      expect(bet).toBeDefined();
      expect(bet.playerId).toBe(playerId);
      expect(bet.getAmount().toCents()).toBe(1000n);
      expect(replacedBet).toBeNull();
    });

    test('should replace PENDING bet and return it', () => {
      round.placeBet(playerId, 'Player One', Money.fromDecimal('5.00'));

      const { bet, replacedBet } = round.placeOrReplaceBet(playerId, 'Player One', amount);

      expect(bet.getAmount().toCents()).toBe(1000n);
      expect(replacedBet).not.toBeNull();
      expect(replacedBet!.getStatus()).toBe('CANCELLED');
      expect(round.getBetByPlayer(playerId)?.getAmount().toCents()).toBe(1000n);
    });

    test('should replace CANCELLED bet without returning it', () => {
      round.placeBet(playerId, 'Player One', Money.fromDecimal('5.00'));
      const existingBet = round.getBetByPlayer(playerId)!;
      existingBet.cancel('test');
      (round as any).bets.set(playerId, existingBet);

      const { bet, replacedBet } = round.placeOrReplaceBet(playerId, 'Player One', amount);

      expect(bet.getAmount().toCents()).toBe(1000n);
      expect(replacedBet).toBeNull();
    });

    test('should reject when existing bet is ACTIVE', async () => {
      round.placeBet(playerId, 'Player One', amount);
      const bet = round.getBetByPlayer(playerId)!;
      (bet as any).confirm();

      await round.startRound();

      expect(() => round.placeOrReplaceBet(playerId, 'Player One', amount)).toThrow(
        RoundNotAcceptingBetsError,
      );
    });

    test('should reject duplicate if existing bet is not PENDING or CANCELLED', async () => {
      round.placeBet(playerId, 'Player One', amount);
      const bet = round.getBetByPlayer(playerId)!;
      (bet as any).confirm();
      await round.startRound();

      const round2 = await Round.create();
      round2.placeBet(playerId, 'Player One', amount);
      const bet2 = round2.getBetByPlayer(playerId)!;
      (bet2 as any).status = 'ACTIVE';

      expect(() => round2.placeOrReplaceBet(playerId, 'Player One', amount)).toThrow(
        DuplicateBetError,
      );
    });

    test('should reject when not in BETTING phase', async () => {
      await round.startRound();

      expect(() => round.placeOrReplaceBet(playerId, 'Player One', amount)).toThrow(
        RoundNotAcceptingBetsError,
      );
    });

    test('should emit BetPlacedEvent for new bet', () => {
      round.pullEvents();

      const { bet } = round.placeOrReplaceBet(playerId, 'Player One', amount);

      const events = round.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('BetPlaced');
    });

    test('should NOT increment version (bet is separate entity from round lifecycle)', () => {
      const v0 = round.getVersion();

      round.placeOrReplaceBet(playerId, 'Player One', amount);
      expect(round.getVersion()).toBe(v0);

      round.placeOrReplaceBet(playerId, 'Player One', Money.fromDecimal('20.00'));
      expect(round.getVersion()).toBe(v0);
    });
  });

  describe('Round Start', () => {
    test('should transition to ACTIVE phase when started', async () => {
      await round.startRound();

      expect(round.getStatus()).toBe(RoundStatus.ACTIVE);
    });

    test('should set startedAt timestamp', async () => {
      await round.startRound();

      expect(round.getStartedAt()).toBeInstanceOf(Date);
    });

    test('should calculate crash point from seed', async () => {
      await round.startRound();

      expect(round.getCrashPoint()).toBeGreaterThanOrEqual(1.0);
    });

    test('should emit BettingPhaseEndedEvent', async () => {
      await round.startRound();
      const events = round.pullEvents();

      const bettingEndedEvent = events.find((e) => e.eventType === 'BettingPhaseEnded');
      expect(bettingEndedEvent).toBeDefined();
      if (bettingEndedEvent && bettingEndedEvent.eventType === 'BettingPhaseEnded') {
        expect(bettingEndedEvent.roundId).toBe(round.id);
      }
    });

    test('should reject starting already ACTIVE round', async () => {
      await round.startRound();

      await expect(round.startRound()).rejects.toThrow();
    });

    test('should increment version when round starts (lifecycle transition)', async () => {
      const initialVersion = round.getVersion();
      await round.startRound();

      expect(round.getVersion()).toBe(initialVersion + 1);
    });
  });

  describe('Cash Out', () => {
    const P1 = PlayerId.from('player-1');
    const P1_NAME = 'Player One';

    beforeEach(async () => {
      round.placeBet(P1, P1_NAME, Money.fromDecimal('10.00'));
      await round.startRound();

      const bet = round.getBetByPlayer(P1);
      if (bet && bet.isPending()) {
        (bet as any).confirm();
      }
    });

    test('should cash out active bet', () => {
      const multiplier = Multiplier.fromValue(2.0);
      (round as any).currentMultiplier = multiplier;

      const payout = round.cashOut(P1);

      expect(payout.toCents()).toBe(2000n);
    });

    test('should mark bet as cashed out', () => {
      const multiplier = Multiplier.fromValue(2.0);
      (round as any).currentMultiplier = multiplier;

      round.cashOut(P1);

      const bet = round.getBetByPlayer(P1);
      expect(bet?.isCashedOut()).toBe(true);
    });

    test('should emit PlayerCashedOutEvent', () => {
      const multiplier = Multiplier.fromValue(2.0);
      (round as any).currentMultiplier = multiplier;

      round.cashOut(P1);

      const events = round.pullEvents();
      const cashOutEvent = events.find((e) => e.eventType === 'PlayerCashedOut');
      expect(cashOutEvent).toBeDefined();
      if (cashOutEvent && cashOutEvent.eventType === 'PlayerCashedOut') {
        expect(cashOutEvent.playerId).toBe(P1);
      }
    });

    test('should reject cash out when not in ACTIVE phase', async () => {
      const inactiveRound = await Round.create();
      inactiveRound.placeBet(P1, P1_NAME, Money.fromDecimal('10.00'));

      expect(() => inactiveRound.cashOut(P1)).toThrow(RoundAlreadyCrashedError);
    });

    test('should reject cash out for non-existent bet', () => {
      expect(() => round.cashOut(PlayerId.from('non-existent-player'))).toThrow(NoActiveBetError);
    });

    test('should reject duplicate cash out', () => {
      const multiplier = Multiplier.fromValue(2.0);
      (round as any).currentMultiplier = multiplier;

      round.cashOut(P1);

      expect(() => round.cashOut(P1)).toThrow(NoActiveBetError);
    });

    test('should NOT increment version when cashing out (bet mutation, not round lifecycle)', () => {
      const multiplier = Multiplier.fromValue(2.0);
      (round as any).currentMultiplier = multiplier;
      const initialVersion = round.getVersion();

      round.cashOut(P1);

      expect(round.getVersion()).toBe(initialVersion);
    });
  });

  describe('Multiplier Update', () => {
    test('should update multiplier based on elapsed time', async () => {
      await round.startRound();

      round.updateMultiplier(1);

      expect(round.getCurrentMultiplier()).toBeGreaterThan(1.0);
    });

    test('should not update multiplier when not in ACTIVE phase', () => {
      round.updateMultiplier(1);

      expect(round.getCurrentMultiplier()).toBe(1.0);
    });

    test('should crash when multiplier exceeds crash point', async () => {
      round.placeBet(PlayerId.from('player-1'), 'Player One', Money.fromDecimal('10.00'));
      await round.startRound();

      (round as any).crashPoint = { shouldCrashAt: () => true, getValue: () => 1.01 };

      round.updateMultiplier(0.01);

      expect(round.getStatus()).toBe(RoundStatus.CRASHED);
    });
  });

  describe('Crash', () => {
    const P1 = PlayerId.from('player-1');
    const P2 = PlayerId.from('player-2');

    beforeEach(async () => {
      round.placeBet(P1, 'Player One', Money.fromDecimal('10.00'));
      round.placeBet(P2, 'Player Two', Money.fromDecimal('20.00'));
      await round.startRound();

      for (const pid of [P1, P2]) {
        const bet = round.getBetByPlayer(pid);
        if (bet && bet.isPending()) {
          (bet as any).confirm();
        }
      }
    });

    test('should transition to CRASHED status', async () => {
      (round as any).crashPoint = { shouldCrashAt: () => true, getValue: () => 1.01 };
      round.updateMultiplier(0.01);

      expect(round.getStatus()).toBe(RoundStatus.CRASHED);
    });

    test('should mark active bets as lost', async () => {
      (round as any).crashPoint = { shouldCrashAt: () => true, getValue: () => 1.01 };
      round.updateMultiplier(0.01);

      const bet1 = round.getBetByPlayer(P1);
      const bet2 = round.getBetByPlayer(P2);

      expect(bet1?.isLost()).toBe(true);
      expect(bet2?.isLost()).toBe(true);
    });

    test('should not mark cashed out bets as lost', async () => {
      const multiplier = Multiplier.fromValue(2.0);
      (round as any).currentMultiplier = multiplier;
      round.cashOut(P1);

      (round as any).crashPoint = { shouldCrashAt: () => true, getValue: () => 3.0 };
      round.updateMultiplier(0.01);

      const bet1 = round.getBetByPlayer(P1);
      const bet2 = round.getBetByPlayer(P2);

      expect(bet1?.isCashedOut()).toBe(true);
      expect(bet2?.isLost()).toBe(true);
    });

    test('should set crashedAt timestamp', async () => {
      (round as any).crashPoint = { shouldCrashAt: () => true, getValue: () => 1.01 };
      round.updateMultiplier(0.01);

      expect(round.getCrashedAt()).toBeInstanceOf(Date);
    });

    test('should emit RoundCrashedEvent', async () => {
      (round as any).crashPoint = { shouldCrashAt: () => true, getValue: () => 1.01 };
      round.updateMultiplier(0.01);

      const events = round.pullEvents();
      const crashEvent = events.find((e) => e.eventType === 'RoundCrashed');

      expect(crashEvent).toBeDefined();
      if (crashEvent && crashEvent.eventType === 'RoundCrashed') {
        expect(crashEvent.crashPoint).toBeDefined();
      }
    });

    test('should include seed in RoundCrashedEvent', async () => {
      (round as any).crashPoint = { shouldCrashAt: () => true, getValue: () => 1.01 };
      round.updateMultiplier(0.01);

      const events = round.pullEvents();
      const crashEvent = events.find((e) => e.eventType === 'RoundCrashed');

      if (crashEvent && crashEvent.eventType === 'RoundCrashed') {
        expect(crashEvent.seed).toBeDefined();
        expect(crashEvent.seed).toHaveLength(64);
      }
    });

    test('should increment version on crash (lifecycle transition)', async () => {
      const initialVersion = round.getVersion();
      (round as any).crashPoint = { shouldCrashAt: () => true, getValue: () => 1.01 };
      round.updateMultiplier(0.01);

      expect(round.getVersion()).toBe(initialVersion + 1);
    });
  });

  describe('Seed Access', () => {
    test('should reveal seed after crash', async () => {
      await round.startRound();

      (round as any).crashPoint = { shouldCrashAt: () => true, getValue: () => 1.01 };
      round.updateMultiplier(0.01);

      const seed = round.getSeed();
      expect(seed).toBeDefined();
      expect(seed).toHaveLength(64);
    });

    test('should reject seed access before crash', async () => {
      await round.startRound();

      expect(() => round.getSeed()).toThrow('Results are not available until the round crashes');
    });
  });

  describe('Domain Events', () => {
    test('should collect and clear events on pullEvents', async () => {
      round.placeBet(PlayerId.from('player-1'), 'Player One', Money.fromDecimal('10.00'));

      const events1 = round.pullEvents();
      const events2 = round.pullEvents();

      expect(events1.length).toBeGreaterThan(0);
      expect(events2).toHaveLength(0);
    });

    test('should track pending events count', async () => {
      round.placeBet(PlayerId.from('player-1'), 'Player One', Money.fromDecimal('10.00'));

      expect(round.getPendingEventsCount()).toBeGreaterThan(0);
    });
  });

  describe('Getters', () => {
    test('should return all bets', () => {
      round.placeBet(PlayerId.from('player-1'), 'Player One', Money.fromDecimal('10.00'));
      round.placeBet(PlayerId.from('player-2'), 'Player Two', Money.fromDecimal('20.00'));

      const bets = round.getBets();

      expect(bets).toHaveLength(2);
    });

    test('should return bet by player ID', () => {
      const p1 = PlayerId.from('player-1');
      round.placeBet(p1, 'Player One', Money.fromDecimal('10.00'));

      const bet = round.getBetByPlayer(p1);

      expect(bet).toBeDefined();
      expect(bet?.playerId).toBe(p1);
    });

    test('should return undefined for non-existent player', () => {
      const bet = round.getBetByPlayer(PlayerId.from('non-existent'));

      expect(bet).toBeUndefined();
    });
  });

  describe('Persistence', () => {
    test('should convert to persistence format', async () => {
      round.placeBet(PlayerId.from('player-1'), 'Player One', Money.fromDecimal('10.00'));

      const data = round.toPersistence();

      expect(data.id).toBeDefined();
      expect(data.seed).toBeDefined();
      expect(data.seedHash).toBeDefined();
      expect(data.status).toBe(RoundStatus.BETTING);
    });

    test('should restore from persistence', async () => {
      const original = await Round.create();
      original.placeBet(PlayerId.from('player-1'), 'Player One', Money.fromDecimal('10.00'));
      await original.startRound();

      const data = original.toPersistence();

      const restored = Round.restore(
        data.id,
        data.seed,
        data.seedHash,
        data.nextSeed,
        data.status,
        data.crashPoint,
        data.bettingEndTime,
        data.startedAt,
        data.crashedAt,
        [],
        data.version,
      );

      expect(restored.id).toBe(original.id);
      expect(restored.getStatus()).toBe(original.getStatus());
    });
  });

  describe('Round auto cash-out', () => {
    test('should place bet with autoCashOutMultiplier', async () => {
      const round = await Round.create(DEFAULT_ROUND_CONFIG);
      round.pullEvents();

      round.placeBet('p1' as any, 'Player 1', Money.fromCents(1000n), 2.5);

      const bets = round.getBets();
      const bet = bets.find((b) => b.playerId === 'p1');
      expect(bet?.getAutoCashOutMultiplier()).toBe(2.5);
    });

    test('should placeOrReplaceBet with autoCashOutMultiplier', async () => {
      const round = await Round.create(DEFAULT_ROUND_CONFIG);
      round.pullEvents();

      const { bet } = round.placeOrReplaceBet('p1' as any, 'Player 1', Money.fromCents(1000n), 2.5);

      expect(bet.getAutoCashOutMultiplier()).toBe(2.5);
    });

    test('should cashOut with override multiplier', async () => {
      const round = await Round.create(DEFAULT_ROUND_CONFIG);
      round.pullEvents();
      round.placeBet('p1' as any, 'Player 1', Money.fromCents(1000n));
      round.pullEvents();

      // Start round
      await round.startRound();
      round.pullEvents();

      // Confirm the bet so it becomes ACTIVE
      const betBefore = round.getBetByPlayer('p1' as any);
      if (betBefore && betBefore.isPending()) {
        (betBefore as any).confirm();
      }

      // Advance multiplier past 2.0
      round.updateMultiplier(1);

      // Cash out with override at exactly 2.0
      const payout = round.cashOut('p1' as any, Multiplier.fromValue(2.0));

      expect(payout.toCents()).toBe(2000n);
      const bet = round.getBetByPlayer('p1' as any);
      expect(bet?.getCashOutMultiplier()?.getValue()).toBe(2.0);
    });

    test('should cashOut without override uses current multiplier', async () => {
      const round = await Round.create(DEFAULT_ROUND_CONFIG);
      round.pullEvents();
      round.placeBet('p1' as any, 'Player 1', Money.fromCents(1000n));
      round.pullEvents();

      await round.startRound();
      round.pullEvents();

      // Confirm the bet so it becomes ACTIVE
      const betBefore = round.getBetByPlayer('p1' as any);
      if (betBefore && betBefore.isPending()) {
        (betBefore as any).confirm();
      }

      round.updateMultiplier(1);

      const currentMultiplier = round.getCurrentMultiplier();
      const payout = round.cashOut('p1' as any);

      // Should use the current multiplier (not an override)
      const bet = round.getBetByPlayer('p1' as any);
      expect(bet?.getCashOutMultiplier()?.getValue()).toBe(currentMultiplier);
    });
  });

  describe('Configuration', () => {
    test('should use default config when not provided', async () => {
      const defaultRound = await Round.create();

      expect(() =>
        defaultRound.placeBet(PlayerId.from('p1'), 'Player 1', Money.fromDecimal('1.00')),
      ).not.toThrow();
      expect(() =>
        defaultRound.placeBet(PlayerId.from('p2'), 'Player 2', Money.fromDecimal('1000.00')),
      ).not.toThrow();
    });

    test('should accept custom config', async () => {
      const customConfig = {
        ...DEFAULT_ROUND_CONFIG,
        minBetAmount: Money.fromDecimal('5.00'),
        maxBetAmount: Money.fromDecimal('500.00'),
      };

      const customRound = await Round.create(customConfig);

      expect(() =>
        customRound.placeBet(PlayerId.from('p1'), 'Player 1', Money.fromDecimal('5.00')),
      ).not.toThrow();
      expect(() =>
        customRound.placeBet(PlayerId.from('p2'), 'Player 2', Money.fromDecimal('4.99')),
      ).toThrow();
    });
  });
});
