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
import { Money } from '@crash/domain';
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
      const playerId = 'player-1';
      const amount = Money.fromDecimal('10.00');

      round.placeBet(playerId, 'Player One', amount);

      const bet = round.getBetByPlayer(playerId);
      expect(bet).toBeDefined();
      expect(bet?.getAmount().toCents()).toBe(1000n);
      expect(bet?.getStatus()).toBe('PENDING'); // Bets start in PENDING state
    });

    test('should emit BetPlacedEvent when bet is placed', () => {
      const playerId = 'player-1';
      const amount = Money.fromDecimal('10.00');

      // Clear existing events from round creation
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
      const playerId = 'player-1';
      const amount = Money.fromDecimal('10.00');

      await round.startRound();

      expect(() => round.placeBet(playerId, 'Player One', amount)).toThrow(
        RoundNotAcceptingBetsError,
      );
    });

    test('should reject duplicate bet from same player', () => {
      const playerId = 'player-1';
      const amount = Money.fromDecimal('10.00');

      round.placeBet(playerId, 'Player One', amount);

      expect(() => round.placeBet(playerId, 'Player One', amount)).toThrow(DuplicateBetError);
    });

    test('should reject bet below minimum', () => {
      const playerId = 'player-1';
      const amount = Money.fromDecimal('0.50'); // Below $1.00 minimum

      expect(() => round.placeBet(playerId, 'Player One', amount)).toThrow(BetBelowMinimumError);
    });

    test('should reject bet above maximum', () => {
      const playerId = 'player-1';
      const amount = Money.fromDecimal('2000.00'); // Above $1000.00 maximum

      expect(() => round.placeBet(playerId, 'Player One', amount)).toThrow(BetAboveMaximumError);
    });

    test('should accept minimum bet amount', () => {
      const playerId = 'player-1';
      const amount = Money.fromDecimal('1.00'); // Exact minimum

      expect(() => round.placeBet(playerId, 'Player One', amount)).not.toThrow();
    });

    test('should accept maximum bet amount', () => {
      const playerId = 'player-1';
      const amount = Money.fromDecimal('1000.00'); // Exact maximum

      expect(() => round.placeBet(playerId, 'Player One', amount)).not.toThrow();
    });

    test('should increment version when bet is placed', () => {
      const playerId = 'player-1';
      const amount = Money.fromDecimal('10.00');
      const initialVersion = round.getVersion();

      round.placeBet(playerId, 'Player One', amount);

      expect(round.getVersion()).toBe(initialVersion + 1);
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

    test('should increment version when round starts', async () => {
      const initialVersion = round.getVersion();
      await round.startRound();

      expect(round.getVersion()).toBe(initialVersion + 1);
    });
  });

  describe('Cash Out', () => {
    beforeEach(async () => {
      // Place a bet and start the round
      round.placeBet('player-1', 'Player One', Money.fromDecimal('10.00'));
      await round.startRound();

      // Confirm the bet (simulate wallet confirmation: PENDING -> ACTIVE)
      const bet = round.getBetByPlayer('player-1');
      if (bet && bet.isPending()) {
        (bet as any).confirm();
      }
    });

    test('should cash out active bet', () => {
      // Use real Multiplier
      const multiplier = Multiplier.fromValue(2.0);
      (round as any).currentMultiplier = multiplier;

      const payout = round.cashOut('player-1');

      expect(payout.toCents()).toBe(2000n); // 10.00 * 2.0 = 20.00
    });

    test('should mark bet as cashed out', () => {
      const multiplier = Multiplier.fromValue(2.0);
      (round as any).currentMultiplier = multiplier;

      round.cashOut('player-1');

      const bet = round.getBetByPlayer('player-1');
      expect(bet?.isCashedOut()).toBe(true);
    });

    test('should emit PlayerCashedOutEvent', () => {
      const multiplier = Multiplier.fromValue(2.0);
      (round as any).currentMultiplier = multiplier;

      round.cashOut('player-1');

      const events = round.pullEvents();
      const cashOutEvent = events.find((e) => e.eventType === 'PlayerCashedOut');
      expect(cashOutEvent).toBeDefined();
      if (cashOutEvent && cashOutEvent.eventType === 'PlayerCashedOut') {
        expect(cashOutEvent.playerId).toBe('player-1');
      }
    });

    test('should reject cash out when not in ACTIVE phase', async () => {
      // Create new round and don't start it
      const inactiveRound = await Round.create();
      inactiveRound.placeBet('player-1', 'Player One', Money.fromDecimal('10.00'));

      expect(() => inactiveRound.cashOut('player-1')).toThrow(RoundAlreadyCrashedError);
    });

    test('should reject cash out for non-existent bet', () => {
      expect(() => round.cashOut('non-existent-player')).toThrow(NoActiveBetError);
    });

    test('should reject duplicate cash out', () => {
      const multiplier = Multiplier.fromValue(2.0);
      (round as any).currentMultiplier = multiplier;

      round.cashOut('player-1');

      expect(() => round.cashOut('player-1')).toThrow(NoActiveBetError);
    });

    test('should increment version when cashing out', () => {
      const multiplier = Multiplier.fromValue(2.0);
      (round as any).currentMultiplier = multiplier;
      const initialVersion = round.getVersion();

      round.cashOut('player-1');

      expect(round.getVersion()).toBe(initialVersion + 1);
    });
  });

  describe('Multiplier Update', () => {
    test('should update multiplier based on elapsed time', async () => {
      await round.startRound();

      round.updateMultiplier(1); // 1 second

      expect(round.getCurrentMultiplier()).toBeGreaterThan(1.0);
    });

    test('should not update multiplier when not in ACTIVE phase', () => {
      round.updateMultiplier(1);

      expect(round.getCurrentMultiplier()).toBe(1.0);
    });

    test('should crash when multiplier exceeds crash point', async () => {
      round.placeBet('player-1', 'Player One', Money.fromDecimal('10.00'));
      await round.startRound();

      // Set a very low crash point
      (round as any).crashPoint = { shouldCrashAt: () => true, getValue: () => 1.01 };

      round.updateMultiplier(0.01);

      expect(round.getStatus()).toBe(RoundStatus.CRASHED);
    });
  });

  describe('Crash', () => {
    beforeEach(async () => {
      round.placeBet('player-1', 'Player One', Money.fromDecimal('10.00'));
      round.placeBet('player-2', 'Player Two', Money.fromDecimal('20.00'));
      await round.startRound();

      // Confirm bets (simulate wallet confirmation: PENDING -> ACTIVE)
      for (const playerId of ['player-1', 'player-2']) {
        const bet = round.getBetByPlayer(playerId);
        if (bet && bet.isPending()) {
          (bet as any).confirm();
        }
      }
    });

    test('should transition to CRASHED status', async () => {
      // Manually trigger crash by setting low crash point
      (round as any).crashPoint = { shouldCrashAt: () => true, getValue: () => 1.01 };
      round.updateMultiplier(0.01);

      expect(round.getStatus()).toBe(RoundStatus.CRASHED);
    });

    test('should mark active bets as lost', async () => {
      (round as any).crashPoint = { shouldCrashAt: () => true, getValue: () => 1.01 };
      round.updateMultiplier(0.01);

      const bet1 = round.getBetByPlayer('player-1');
      const bet2 = round.getBetByPlayer('player-2');

      expect(bet1?.isLost()).toBe(true);
      expect(bet2?.isLost()).toBe(true);
    });

    test('should not mark cashed out bets as lost', async () => {
      const multiplier = Multiplier.fromValue(2.0);
      (round as any).currentMultiplier = multiplier;
      round.cashOut('player-1');

      (round as any).crashPoint = { shouldCrashAt: () => true, getValue: () => 3.0 };
      round.updateMultiplier(0.01);

      const bet1 = round.getBetByPlayer('player-1');
      const bet2 = round.getBetByPlayer('player-2');

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

    test('should increment version on crash', async () => {
      const initialVersion = round.getVersion();
      (round as any).crashPoint = { shouldCrashAt: () => true, getValue: () => 1.01 };
      round.updateMultiplier(0.01);

      expect(round.getVersion()).toBe(initialVersion + 1);
    });
  });

  describe('Seed Access', () => {
    test('should reveal seed after crash', async () => {
      await round.startRound();

      // Manually crash
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
      round.placeBet('player-1', 'Player One', Money.fromDecimal('10.00'));

      const events1 = round.pullEvents();
      const events2 = round.pullEvents();

      expect(events1.length).toBeGreaterThan(0);
      expect(events2).toHaveLength(0);
    });

    test('should track pending events count', async () => {
      round.placeBet('player-1', 'Player One', Money.fromDecimal('10.00'));

      expect(round.getPendingEventsCount()).toBeGreaterThan(0);
    });
  });

  describe('Getters', () => {
    test('should return all bets', () => {
      round.placeBet('player-1', 'Player One', Money.fromDecimal('10.00'));
      round.placeBet('player-2', 'Player Two', Money.fromDecimal('20.00'));

      const bets = round.getBets();

      expect(bets).toHaveLength(2);
    });

    test('should return bet by player ID', () => {
      round.placeBet('player-1', 'Player One', Money.fromDecimal('10.00'));

      const bet = round.getBetByPlayer('player-1');

      expect(bet).toBeDefined();
      expect(bet?.playerId).toBe('player-1');
    });

    test('should return undefined for non-existent player', () => {
      const bet = round.getBetByPlayer('non-existent');

      expect(bet).toBeUndefined();
    });
  });

  describe('Persistence', () => {
    test('should convert to persistence format', async () => {
      round.placeBet('player-1', 'Player One', Money.fromDecimal('10.00'));

      const data = round.toPersistence();

      expect(data.id).toBeDefined();
      expect(data.seed).toBeDefined();
      expect(data.seedHash).toBeDefined();
      expect(data.status).toBe(RoundStatus.BETTING);
    });

    test('should restore from persistence', async () => {
      const original = await Round.create();
      original.placeBet('player-1', 'Player One', Money.fromDecimal('10.00'));
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

  describe('Configuration', () => {
    test('should use default config when not provided', async () => {
      const defaultRound = await Round.create();

      expect(() =>
        defaultRound.placeBet('p1', 'Player 1', Money.fromDecimal('1.00')),
      ).not.toThrow();
      expect(() =>
        defaultRound.placeBet('p2', 'Player 2', Money.fromDecimal('1000.00')),
      ).not.toThrow();
    });

    test('should accept custom config', async () => {
      const customConfig = {
        ...DEFAULT_ROUND_CONFIG,
        minBetAmount: Money.fromDecimal('5.00'),
        maxBetAmount: Money.fromDecimal('500.00'),
      };

      const customRound = await Round.create(customConfig);

      expect(() => customRound.placeBet('p1', 'Player 1', Money.fromDecimal('5.00'))).not.toThrow();
      expect(() => customRound.placeBet('p2', 'Player 2', Money.fromDecimal('4.99'))).toThrow();
    });
  });
});
